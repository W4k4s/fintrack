import { dedupKey, weekWindowKey } from "../dedup";
import { computeUnrealizedPnL, estimateRealizedYtdEur, daysToYearEnd, type TaxBucket } from "../tax/positions";
import type { Detector, DetectorContext, DetectorSignal, Severity } from "../types";

const LOSS_MED = 300;
const LOSS_HIGH = 1000;
const LOSS_CRITICAL = 3000;
const YEAR_END_CRUNCH_DAYS = 45;

function baseSeverity(absLoss: number): Severity | null {
  if (absLoss >= LOSS_CRITICAL) return "critical";
  if (absLoss >= LOSS_HIGH) return "high";
  if (absLoss >= LOSS_MED) return "med";
  return null;
}

function boostSeverity(sev: Severity): Severity {
  if (sev === "low") return "med";
  if (sev === "med") return "high";
  return "critical";
}

function bucketLabel(b: TaxBucket): string {
  return b === "crypto" ? "Crypto" : "Tradicional (ETFs/Stocks/Gold/Bonos)";
}

export const taxHarvestWindowDetector: Detector = {
  scope: "tax_harvest",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const month = ctx.madridNow.getMonth(); // 0-indexed, Oct=9
    if (month < 9) return [];

    const { byBucket } = await computeUnrealizedPnL();
    const realized = await estimateRealizedYtdEur(ctx.now);
    const dte = daysToYearEnd(ctx.now);
    const windowKey = weekWindowKey(ctx.now);

    const signals: DetectorSignal[] = [];

    for (const bucket of ["crypto", "traditional"] as const) {
      const data = byBucket[bucket];
      const absLoss = Math.abs(data.lossEur);
      let severity = baseSeverity(absLoss);
      if (!severity) continue;

      if (dte < YEAR_END_CRUNCH_DAYS) severity = boostSeverity(severity);

      const realizedYtd = realized[bucket];
      const label = bucketLabel(bucket);
      const title = `Tax harvest ${label}: ${absLoss.toFixed(0)}€ pérdidas latentes, ${dte}d a cierre fiscal`;
      const realizedHint =
        realizedYtd > 50
          ? ` Plusvalías ${bucket} YTD estimadas ≈${realizedYtd.toFixed(0)}€ → compensables.`
          : realizedYtd < -50
            ? ` Minusvalías ${bucket} YTD estimadas ≈${realizedYtd.toFixed(0)}€ (4 años para compensar).`
            : "";
      const summary =
        `${data.positions.length} posición(es) en pérdida en bucket ${bucket} suman -${absLoss.toFixed(0)}€ unrealized.` +
        realizedHint +
        ` Oct-Dec es ventana para realizar pérdidas y bajar base imponible 2026.`;

      signals.push({
        dedupKey: dedupKey("tax_harvest", bucket, windowKey),
        scope: "tax_harvest",
        asset: null,
        assetClass: bucket === "crypto" ? "crypto" : "traditional",
        severity,
        title,
        summary,
        payload: {
          bucket,
          unrealizedLossEur: Math.round(data.lossEur),
          realizedYtdEur: Math.round(realizedYtd),
          realizedYtdApproximate: true,
          daysToYearEnd: dte,
          positions: data.positions.map((p) => ({
            symbol: p.symbol,
            amount: p.amount,
            avgBuyEur: round4(p.avgBuyEur),
            currentEur: round4(p.currentEur),
            costBasisEur: round2(p.costBasisEur),
            currentValueEur: round2(p.currentValueEur),
            pnlEur: round2(p.pnlEur),
            pnlPct: Math.round(p.pnlPct * 10) / 10,
          })),
          thresholds: { med: LOSS_MED, high: LOSS_HIGH, critical: LOSS_CRITICAL },
          washSaleNote: "España AEAT: esperar ≥2 meses antes de recomprar para no invalidar la pérdida.",
          bucketRule:
            bucket === "crypto"
              ? "Pérdidas crypto solo compensan ganancias crypto (4 años arrastre)."
              : "Pérdidas de valores mobiliarios (ETFs/acciones/bonos/oro ETC) en grupo propio.",
        },
        suggestedAction: "sell_partial",
        actionAmountEur: Math.round(absLoss),
      });
    }

    return signals;
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
