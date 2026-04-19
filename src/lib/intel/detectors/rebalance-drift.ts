import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { computeAllocation } from "../allocation/compute";
import { ASSET_CLASSES, type AssetClass } from "../allocation/classify";
import { dedupKey, weekWindowKey } from "../dedup";
import type { Detector, DetectorContext, DetectorSignal, Severity, SuggestedAction } from "../types";

const DRIFT_MED = 7;
const DRIFT_HIGH = 10;
const DRIFT_CRITICAL = 15;

const CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etfs: "ETFs",
  gold: "Gold",
  bonds: "Bonds",
  stocks: "Stocks",
};

const TARGET_COL: Record<AssetClass, keyof typeof schema.strategyProfiles.$inferSelect> = {
  cash: "targetCash",
  crypto: "targetCrypto",
  etfs: "targetEtfs",
  gold: "targetGold",
  bonds: "targetBonds",
  stocks: "targetStocks",
};

function severityFor(absDrift: number): Severity | null {
  if (absDrift >= DRIFT_CRITICAL) return "critical";
  if (absDrift >= DRIFT_HIGH) return "high";
  if (absDrift >= DRIFT_MED) return "med";
  return null;
}

function actionFor(direction: "over" | "under", cls: AssetClass): SuggestedAction {
  // Cash sobreexpuesto = no vender cash, desplegar a otras clases → rebalance.
  if (direction === "over") return cls === "cash" ? "rebalance" : "sell_partial";
  return "rebalance";
}

export const rebalanceDriftDetector: Detector = {
  scope: "drift",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const [profile] = await db
      .select()
      .from(schema.strategyProfiles)
      .where(eq(schema.strategyProfiles.active, true))
      .limit(1);
    if (!profile) return [];

    const allocation = await computeAllocation();
    if (allocation.netWorth <= 0) return [];

    const windowKey = weekWindowKey(ctx.now);
    const signals: DetectorSignal[] = [];

    for (const cls of ASSET_CLASSES) {
      const target = Number(profile[TARGET_COL[cls]] ?? 0);
      if (!Number.isFinite(target)) continue;

      const actual = allocation.byClass[cls].pct;
      const drift = actual - target;
      const severity = severityFor(Math.abs(drift));
      if (!severity) continue;

      const direction: "over" | "under" = drift > 0 ? "over" : "under";
      const label = CLASS_LABEL[cls];
      const sign = drift > 0 ? "+" : "";
      const gapEur = (Math.abs(drift) / 100) * allocation.netWorth;

      const title = `${label} ${actual.toFixed(1)}% vs target ${target.toFixed(0)}% (${sign}${drift.toFixed(1)}pp)`;
      const summary =
        direction === "over"
          ? `${label} sobreexpuesto: ${actual.toFixed(1)}% de net worth (target ${target.toFixed(0)}%). Exceso ≈${gapEur.toFixed(0)}€.`
          : `${label} infraexpuesto: ${actual.toFixed(1)}% de net worth (target ${target.toFixed(0)}%). Faltan ≈${gapEur.toFixed(0)}€.`;

      signals.push({
        dedupKey: dedupKey("drift", cls, `${windowKey}:${direction}`),
        scope: "drift",
        asset: null,
        assetClass: cls,
        severity,
        title,
        summary,
        payload: {
          class: cls,
          actualPct: Math.round(actual * 100) / 100,
          targetPct: target,
          driftPp: Math.round(drift * 100) / 100,
          direction,
          netWorth: Math.round(allocation.netWorth),
          gapEur: Math.round(gapEur),
          thresholds: { med: DRIFT_MED, high: DRIFT_HIGH, critical: DRIFT_CRITICAL },
          profileId: profile.id,
        },
        suggestedAction: actionFor(direction, cls),
        actionAmountEur: Math.round(gapEur),
      });
    }

    return signals;
  },
};
