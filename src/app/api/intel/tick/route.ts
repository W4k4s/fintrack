import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { detectorsForScope } from "@/lib/intel/detectors";
import { linkNewsItemsToSignals } from "@/lib/intel/detectors/news-filter";
import { persistSignals } from "@/lib/intel/persist";
import { spawnClaudeForSignal } from "@/lib/intel/claude-spawn";
import { cleanupOldSignals } from "@/lib/intel/retention";
import { evaluateCooldowns } from "@/lib/intel/cooldowns";
import { recordAllocationSnapshot } from "@/lib/intel/allocation/snapshot";
import { syncRebalanceOrdersForCreated } from "@/lib/intel/rebalance/orders";
import type { IntelScope } from "@/lib/intel/types";

/**
 * POST /api/intel/tick?scope=<scope|all>
 *
 * Motor periódico. Ejecuta detectores, persiste signals nuevas y lanza agente
 * Claude para las de severity>=med. Idempotente por unique(dedupKey).
 */
export async function POST(req: NextRequest) {
  const scope = (req.nextUrl.searchParams.get("scope") || "all") as IntelScope | "all";
  const detectors = detectorsForScope(scope);

  if (detectors.length === 0) {
    return NextResponse.json({ error: `unknown scope: ${scope}` }, { status: 400 });
  }

  const runStartIso = new Date().toISOString();
  const [runRow] = await db
    .insert(schema.intelRuns)
    .values({ scope, startedAt: runStartIso })
    .returning({ id: schema.intelRuns.id });

  // Opportunistic retention — cheap if nothing stale exists.
  try {
    await cleanupOldSignals();
  } catch (err) {
    console.error("[intel] cleanup failed", err);
  }

  const now = new Date();

  // Fase 6.2 — snapshot de allocation (1/día, idempotente). Se escribe antes
  // de correr detectores para que profile-review vea el día de hoy.
  try {
    await recordAllocationSnapshot(now);
  } catch (err) {
    console.error("[intel] allocation snapshot failed", err);
  }

  // madridNow lo usan los detectores solo para contexto "mismo instante";
  // la conversión a hora/día Madrid ocurre dentro de cada detector via lib/intel/tz.
  const madridNow = now;
  const errors: string[] = [];
  let totalCreated = 0;
  let spawns = 0;
  const results: { scope: string; created: number[]; skipped: number }[] = [];

  for (const detector of detectors) {
    try {
      const candidates = await detector.run({ now, madridNow });
      const { created, skipped } = await persistSignals(candidates);
      totalCreated += created.length;
      results.push({ scope: detector.scope, created, skipped });

      if (detector.scope === "drift" && created.length > 0) {
        try {
          await syncRebalanceOrdersForCreated(created);
        } catch (e) {
          console.error("[intel] rebalance orders sync failed", e);
        }
      }

      if (detector.scope === "news" && created.length > 0) {
        const dedupToNewsId = new Map<string, number>();
        for (const c of candidates) {
          const newsItemId = Number((c.payload as { newsItemId?: number }).newsItemId);
          if (Number.isFinite(newsItemId)) dedupToNewsId.set(c.dedupKey, newsItemId);
        }
        const createdRows = await db
          .select({
            id: schema.intelSignals.id,
            dedupKey: schema.intelSignals.dedupKey,
          })
          .from(schema.intelSignals)
          .where(eq(schema.intelSignals.scope, "news"));
        const links = createdRows
          .filter((r) => created.includes(r.id) && dedupToNewsId.has(r.dedupKey))
          .map((r) => ({ signalId: r.id, newsItemId: dedupToNewsId.get(r.dedupKey)! }));
        if (links.length > 0) await linkNewsItemsToSignals(links);
      }

      // Spawn Claude para las signals nuevas severity>=med
      for (const sigId of created) {
        const [row] = await db
          .select()
          .from(schema.intelSignals)
          .where(eq(schema.intelSignals.id, sigId))
          .limit(1);
        if (!row) continue;
        if (row.severity === "med" || row.severity === "high" || row.severity === "critical") {
          void spawnClaudeForSignal(row.id).catch((e) =>
            console.error(`[intel] spawn fail signal=${row.id}`, e),
          );
          spawns++;
        }
      }
    } catch (err) {
      const msg = `${detector.scope}: ${String(err)}`;
      console.error("[intel] detector error", msg);
      errors.push(msg);
    }
  }

  // Feedback loop: re-evaluate per-scope cooldowns with updated signals.
  let cooldownsApplied: string[] = [];
  try {
    const evals = await evaluateCooldowns();
    cooldownsApplied = evals.filter((e) => e.applied).map((e) => e.scope);
  } catch (err) {
    console.error("[intel] cooldown evaluation failed", err);
  }

  if (runRow) {
    await db
      .update(schema.intelRuns)
      .set({
        finishedAt: new Date().toISOString(),
        signalsCreated: totalCreated,
        spawnsLaunched: spawns,
        errors: errors.length ? JSON.stringify(errors) : null,
      })
      .where(eq(schema.intelRuns.id, runRow.id));
  }

  return NextResponse.json({
    runId: runRow?.id,
    scope,
    signalsCreated: totalCreated,
    spawnsLaunched: spawns,
    errors,
    cooldownsApplied,
    results,
  });
}
