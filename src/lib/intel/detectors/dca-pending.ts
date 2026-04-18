import { db, schema } from "@/lib/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { dedupKey, weekWindowKey } from "../dedup";
import { madridParts } from "../tz";
import type { Detector, DetectorContext, DetectorSignal } from "../types";

/**
 * Detecta planes DCA manuales (Binance crypto) con la semana en curso sin
 * ejecutar y ya en la ventana de urgencia (lunes ≥ 20:00 Madrid ó domingo
 * cualquier hora). No aplica a planes `autoExecute` (Sparplan TR).
 */

function weekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // lunes como inicio
  copy.setUTCDate(copy.getUTCDate() + diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const dcaPendingDetector: Detector = {
  scope: "dca_pending",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const { dayOfWeek, hour } = madridParts(ctx.now);

    // solo a partir del lunes 20h madrid ó durante el domingo completo
    const urgent = (dayOfWeek === 1 && hour >= 20) || dayOfWeek === 0 ||
      dayOfWeek >= 2; // martes+ también avisa si sigue pendiente
    if (!urgent) return [];

    const plans = await db
      .select()
      .from(schema.investmentPlans)
      .where(eq(schema.investmentPlans.enabled, true));

    const manualCryptoPlans = plans.filter(
      (p) =>
        !p.autoExecute &&
        (p.assetClass === "crypto" ||
          ["BTC", "ETH", "SOL", "PEPE", "SHIB", "BNB"].includes(p.asset)),
    );

    if (manualCryptoPlans.length === 0) return [];

    const wStart = weekStart(ctx.now);
    const wEnd = new Date(wStart);
    wEnd.setUTCDate(wEnd.getUTCDate() + 7);
    const wStartIso = isoDate(wStart);
    const wEndIso = isoDate(wEnd);

    const signals: DetectorSignal[] = [];
    const windowKey = weekWindowKey(ctx.now);

    for (const plan of manualCryptoPlans) {
      const execs = await db
        .select()
        .from(schema.dcaExecutions)
        .where(
          and(
            eq(schema.dcaExecutions.planId, plan.id),
            gte(schema.dcaExecutions.date, wStartIso),
            lte(schema.dcaExecutions.date, wEndIso),
          ),
        );

      const executedAmount = execs.reduce((s, e) => s + (e.amount || 0), 0);
      const weeklyTarget = plan.frequency === "monthly" ? plan.amount / 4 : plan.amount;
      const ratio = weeklyTarget > 0 ? executedAmount / weeklyTarget : 1;
      if (ratio >= 0.9) continue; // ya está cubierto

      const missing = Math.max(0, weeklyTarget - executedAmount);
      // high si viernes+, domingo, o lunes siguiente (riesgo de saltarse la semana)
      const severity = dayOfWeek >= 5 || dayOfWeek === 0 ? "high" : "med";

      signals.push({
        dedupKey: dedupKey("dca_pending", plan.asset, windowKey),
        scope: "dca_pending",
        asset: plan.asset,
        assetClass: plan.assetClass ?? "crypto",
        severity,
        title: `DCA ${plan.asset} pendiente semana ${windowKey}`,
        summary: `Falta ${missing.toFixed(2)}€ de ${weeklyTarget.toFixed(
          2,
        )}€ objetivo (${(ratio * 100).toFixed(0)}% ejecutado).`,
        payload: {
          planId: plan.id,
          weeklyTarget,
          executed: executedAmount,
          missing,
          ratio,
          broker: plan.broker,
          madridDayOfWeek: dayOfWeek,
          madridHour: hour,
        },
        suggestedAction: "buy_accelerate",
        actionAmountEur: Math.round(missing * 100) / 100,
      });
    }

    return signals;
  },
};
