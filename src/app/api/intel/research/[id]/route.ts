import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  evaluateCorrelationGuardrail,
  CORR_THRESHOLD,
  WEIGHT_PCT_THRESHOLD,
  type GuardrailDecision,
} from "@/lib/intel/research/correlation-guardrail";

/**
 * GET /api/intel/research/:id — dossier completo con JSON parseado.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const [row] = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(eq(schema.intelAssetsTracked.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    ...row,
    dossier: row.dossierJson ? safeParse(row.dossierJson) : null,
    technical: row.technicalSnapshotJson ? safeParse(row.technicalSnapshotJson) : null,
    correlation: row.correlationJson ? safeParse(row.correlationJson) : null,
    news: row.newsPreviewJson ? safeParse(row.newsPreviewJson) : null,
  });
}

/**
 * POST /api/intel/research/:id — acciones de transición de estado.
 * Body: { action: "archive" | "promote_shortlisted" | "promote_watching" | "promote_open" | "retry" }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const [row] = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(eq(schema.intelAssetsTracked.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  let patch: Partial<typeof schema.intelAssetsTracked.$inferInsert> = { updatedAt: now };
  let guardrail: GuardrailDecision | null = null;

  switch (action) {
    case "archive":
      patch = { ...patch, status: "archived", closedAt: now, closedReason: "archived_by_user" };
      break;
    case "promote_shortlisted":
      patch = { ...patch, status: "shortlisted" };
      if (typeof body.interestReason === "string") patch.interestReason = body.interestReason.slice(0, 500);
      break;
    case "promote_watching":
    case "promote_open": {
      // Strategy V2 Fase 2 — correlation guardrail pre-check.
      // Bloquea si corr 90d > CORR_THRESHOLD con algún holding > WEIGHT_PCT_THRESHOLD.
      // Override explícito: body.overrideCorrelationWarning = true.
      guardrail = await evaluateCorrelationGuardrail(row.ticker, {
        override: body.overrideCorrelationWarning === true,
      });
      if (guardrail.outcome === "blocked") {
        return NextResponse.json(
          {
            error: "correlation_guardrail_blocked",
            hits: guardrail.hits,
            holdings: guardrail.holdings,
            thresholds: { corr: CORR_THRESHOLD, weightPct: WEIGHT_PCT_THRESHOLD },
            hint: "Para forzar, incluir overrideCorrelationWarning=true en el body",
          },
          { status: 409 },
        );
      }
      if (action === "promote_watching") {
        patch = { ...patch, status: "watching" };
        if (typeof body.thesis === "string") patch.thesis = body.thesis.slice(0, 2000);
        if (typeof body.entryPlan === "string") patch.entryPlan = body.entryPlan.slice(0, 500);
        if (typeof body.targetPrice === "number") patch.targetPrice = body.targetPrice;
        if (typeof body.stopPrice === "number") patch.stopPrice = body.stopPrice;
        if (typeof body.timeHorizonMonths === "number") patch.timeHorizonMonths = body.timeHorizonMonths;
      } else {
        patch = { ...patch, status: "open_position", entryDate: now };
        if (typeof body.entryPrice === "number") patch.entryPrice = body.entryPrice;
      }
      if (guardrail.outcome === "overridden") {
        patch.overrideCorrWarning = true;
      }
      break;
    }
    case "retry":
      if (row.status !== "failed") {
        return NextResponse.json({ error: "only failed rows can retry" }, { status: 400 });
      }
      patch = { ...patch, status: "researching", failureReason: null };
      // Re-spawn al final (tras actualizar).
      break;
    default:
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  await db.update(schema.intelAssetsTracked).set(patch).where(eq(schema.intelAssetsTracked.id, id));

  if (action === "retry") {
    // Import dinámico para no crear dependencia circular con el route del POST raíz.
    const { spawnClaudeForResearch } = await import("@/lib/intel/research/claude-runner");
    spawnClaudeForResearch(id).catch((e) => console.error(`[research] retry spawn crashed id=${id}:`, e));
  }

  const [updated] = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(eq(schema.intelAssetsTracked.id, id))
    .limit(1);
  return NextResponse.json({ ok: true, row: updated, guardrail });
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
