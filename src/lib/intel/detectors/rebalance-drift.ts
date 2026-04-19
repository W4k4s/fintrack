import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { computeAllocation } from "../allocation/compute";
import { ASSET_CLASSES, type AssetClass } from "../allocation/classify";
import { dedupKey, weekWindowKey } from "../dedup";
import { estimateRealizedYtdEur } from "../tax/positions";
import { getEurPerUsd } from "@/lib/currency-rates";
import { getExchangeInfo } from "@/lib/exchanges/registry";
import { buildPositionDetails, buildRebalancePlan } from "../rebalance/planner";
import { irpfSeverity } from "../rebalance/irpf";
import type { RebalancePlan } from "../rebalance/types";
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

const SEVERITY_RANK: Record<Severity, number> = { low: 0, med: 1, high: 2, critical: 3 };

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
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
    let maxSev: Severity = "low";
    let anyTriggered = false;

    // ── Signals por clase (granularidad mantenida).
    for (const cls of ASSET_CLASSES) {
      const target = Number(profile[TARGET_COL[cls]] ?? 0);
      if (!Number.isFinite(target)) continue;

      const actual = allocation.byClass[cls].pct;
      const drift = actual - target;
      const severity = severityFor(Math.abs(drift));
      if (!severity) continue;
      anyTriggered = true;
      maxSev = maxSeverity(maxSev, severity);

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

    if (!anyTriggered) return signals;

    // ── Signal agregado con plan ejecutable (Fase 5).
    try {
      const [assets, accounts, exchanges] = await Promise.all([
        db.select().from(schema.assets),
        db.select().from(schema.accounts),
        db.select().from(schema.exchanges),
      ]);
      const eurPerUsd = await getEurPerUsd();
      const accountById = new Map(accounts.map((a) => [a.id, a]));
      const exchangeById = new Map(exchanges.map((e) => [e.id, e]));
      const exchangeIdByAccountId = new Map(
        accounts.map((a) => [a.id, a.exchangeId] as const),
      );
      const exchangeCategoryById = new Map<number, string | undefined>();
      for (const [id, ex] of exchangeById) {
        exchangeCategoryById.set(id, getExchangeInfo(ex.slug)?.category);
      }
      const accountCategoryById = new Map<number, string | undefined>();
      for (const [id, acc] of accountById) {
        const ex = exchangeById.get(acc.exchangeId);
        accountCategoryById.set(id, ex ? getExchangeInfo(ex.slug)?.category : undefined);
      }

      const positions = buildPositionDetails(
        assets,
        accountCategoryById,
        exchangeIdByAccountId,
        exchangeCategoryById,
        eurPerUsd,
      );

      const realizedYtd = await estimateRealizedYtdEur(ctx.now);

      const plan = buildRebalancePlan({
        allocation,
        profile,
        positions,
        realizedYtd,
        realizedYtdTraditionalOverrideEur:
          profile.realizedYtdTraditionalOverrideEur ?? null,
        weekKey: windowKey,
      });

      if (plan) {
        const planSeverity = planSeverityFor(plan, maxSev);
        const planTitle = buildPlanTitle(plan);
        const planSummary = buildPlanSummary(plan);
        signals.push({
          dedupKey: dedupKey("drift", "plan", windowKey),
          scope: "drift",
          asset: null,
          assetClass: null,
          severity: planSeverity,
          title: planTitle,
          summary: planSummary,
          payload: { plan },
          suggestedAction: "rebalance",
          actionAmountEur:
            plan.moves.sells.reduce((acc, s) => acc + s.amountEur, 0) +
            plan.moves.cashDeployEur,
        });
      }
    } catch (err) {
      console.error("[rebalance-drift] failed building aggregated plan:", err);
    }

    return signals;
  },
};

function planSeverityFor(plan: RebalancePlan, driftMax: Severity): Severity {
  const fiscalSev = irpfSeverity(plan.fiscal.irpfEstimateEur);
  return maxSeverity(driftMax, fiscalSev);
}

function buildPlanTitle(plan: RebalancePlan): string {
  const parts: string[] = [];
  if (plan.moves.sells.length > 0) {
    const sellSum = plan.moves.sells.reduce((a, s) => a + s.amountEur, 0);
    parts.push(`vender ${sellSum.toFixed(0)}€`);
  }
  if (plan.moves.cashDeployEur > 0) {
    parts.push(`desplegar ${plan.moves.cashDeployEur.toFixed(0)}€ cash`);
  }
  if (plan.moves.buys.length > 0) {
    const buySum = plan.moves.buys.reduce((a, b) => a + b.amountEur, 0);
    parts.push(`comprar ${buySum.toFixed(0)}€`);
  }
  const irpfTag = plan.fiscal.irpfEstimateEur > 0
    ? ` · IRPF≈${plan.fiscal.irpfEstimateEur.toFixed(0)}€`
    : "";
  return `Rebalance plan: ${parts.join(" + ")}${irpfTag}`;
}

function buildPlanSummary(plan: RebalancePlan): string {
  const classes = plan.generatedFrom.map((c) => CLASS_LABEL[c]).join(", ");
  const coverage = plan.coverage.coveragePct;
  const coverageTag = coverage < 100 ? ` Cobertura parcial ${coverage}%.` : "";
  const capTag = plan.coverage.capApplied ? " Cap 50%/posición aplicado." : "";
  return `Plan coordinado para rebalancear ${classes}. Net worth ${plan.netWorthEur.toLocaleString()}€.${coverageTag}${capTag}`;
}
