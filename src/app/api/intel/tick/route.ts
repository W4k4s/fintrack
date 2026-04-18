import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { detectorsForScope } from "@/lib/intel/detectors";
import { persistSignals } from "@/lib/intel/persist";
import { spawnClaudeForSignal } from "@/lib/intel/claude-spawn";
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

  const now = new Date();
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
    results,
  });
}
