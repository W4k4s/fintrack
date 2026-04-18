export type IntelScope =
  | "price_dip"
  | "price_surge"
  | "fg_regime"
  | "funding_anomaly"
  | "news"
  | "macro_event"
  | "drift"
  | "tax_harvest"
  | "rebalance"
  | "dca_pending"
  | "custom";

export type Severity = "low" | "med" | "high" | "critical";

export type SuggestedAction =
  | "buy_accelerate"
  | "hold"
  | "pause_dca"
  | "rebalance"
  | "sell_partial"
  | "review"
  | "ignore";

export interface DetectorSignal {
  dedupKey: string;
  scope: IntelScope;
  asset?: string | null;
  assetClass?: string | null;
  severity: Severity;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  suggestedAction?: SuggestedAction | null;
  actionAmountEur?: number | null;
}

export interface DetectorContext {
  now: Date;
  madridNow: Date;
}

export interface Detector {
  scope: IntelScope;
  run(ctx: DetectorContext): Promise<DetectorSignal[]>;
}
