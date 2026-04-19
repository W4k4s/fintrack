import type { AssetClass } from "../allocation/classify";
import type { TaxBucket } from "../tax/positions";

export interface PlanSell {
  symbol: string;
  class: AssetClass;
  bucket: TaxBucket;
  amountEur: number;
  /** Estimated unrealized P&L realized on this sell. Positive = gain, negative = loss. */
  unrealizedPnlEur: number;
}

export interface PlanBuy {
  /** null when clase has no existing holdings — see `needsStrategyPick`. */
  symbol: string | null;
  class: AssetClass;
  amountEur: number;
  needsStrategyPick?: boolean;
}

export interface PlanFiscal {
  /** Sum of positive unrealized gains hit by sells (EUR). */
  totalGainEur: number;
  /** Sum of absolute losses (EUR, positive number). */
  totalLossEur: number;
  /** Net positive gain per bucket after intra-bucket loss compensation. Clamped >= 0. */
  netGainCryptoEur: number;
  netGainTraditionalEur: number;
  /** Total realized YTD used as base for marginal IRPF calculation (crypto + traditional). */
  realizedYtdEur: number;
  /** Estimated IRPF cost in EUR, marginal over tramos AEAT starting at realizedYtdEur. */
  irpfEstimateEur: number;
  /** Effective rate = irpfEstimateEur / (netGainCrypto + netGainTraditional). 0 if no gains. */
  effectiveRate: number;
  notes: string[];
  /** If user provided a manual override for YTD traditional, this records it. */
  realizedYtdOverrideEur?: number;
}

export interface PlanCoverage {
  capitalAvailableEur: number;
  capitalNeededEur: number;
  /** 100 = every sell/buy target was met. <100 = partial plan. */
  coveragePct: number;
  /** True if any per-position 50% cap was applied and prevented full coverage. */
  capApplied: boolean;
}

export interface ClassDrift {
  actualPct: number;
  targetPct: number;
  driftPp: number;
}

export interface RebalancePlan {
  netWorthEur: number;
  /** ISO week key (YYYY-Wxx) used as stale detection baseline. */
  generatedWeek: string;
  /** Snapshot of drift per class at plan generation. Used for staleness detection. */
  targets: Record<AssetClass, ClassDrift>;
  moves: {
    sells: PlanSell[];
    buys: PlanBuy[];
    cashDeployEur: number;
    executionOrder: "sells_first";
  };
  fiscal: PlanFiscal;
  coverage: PlanCoverage;
  /** List of class names that triggered the plan (drift >= MED). */
  generatedFrom: AssetClass[];
}
