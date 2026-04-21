import type { schema } from "@/lib/db";

// Strategy V2 Fase 4 — helper compartido entre POST (promote_watching,
// promote_open) y PATCH del endpoint /api/intel/research/:id. Valida los
// campos editables de tesis, los recorta y los añade a `patch`. Ignora
// silenciosamente los ausentes o mal tipados para que el caller pueda
// enviar solo lo que cambia.

export type ThesisPatch = Partial<typeof schema.intelAssetsTracked.$inferInsert>;

export function applyThesisPatch(
  patch: ThesisPatch,
  body: Record<string, unknown>,
): ThesisPatch {
  if (typeof body.thesis === "string") patch.thesis = body.thesis.slice(0, 2000);
  if (typeof body.entryPlan === "string") patch.entryPlan = body.entryPlan.slice(0, 500);
  if (typeof body.targetPrice === "number" && Number.isFinite(body.targetPrice)) {
    patch.targetPrice = body.targetPrice;
  }
  if (typeof body.stopPrice === "number" && Number.isFinite(body.stopPrice)) {
    patch.stopPrice = body.stopPrice;
  }
  if (typeof body.timeHorizonMonths === "number" && Number.isFinite(body.timeHorizonMonths)) {
    patch.timeHorizonMonths = Math.trunc(body.timeHorizonMonths);
  }
  if (typeof body.entryPrice === "number" && Number.isFinite(body.entryPrice)) {
    patch.entryPrice = body.entryPrice;
  }
  if (typeof body.entryDate === "string") {
    const d = new Date(body.entryDate);
    if (!Number.isNaN(d.getTime())) patch.entryDate = d.toISOString();
  }
  return patch;
}
