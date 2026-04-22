export interface StrategyProfile {
  id: number; name: string; riskProfile: string;
  targetCash: number; targetEtfs: number; targetCrypto: number;
  targetGold: number; targetBonds: number; targetStocks: number;
  monthlyInvest: number; emergencyMonths: number; notes: string | null;
  // R1 Refactor — SSOT para narrative + policies + fondo emergencia.
  tagline: string | null; philosophy: string | null;
  policiesJson: string | null; monthlyFixedExpenses: number;
}

export interface Goal {
  id: number; name: string; type: string; targetValue: number;
  targetAsset: string | null; targetUnit: string; deadline: string | null;
  priority: number; completed: boolean; currentValue: number; progress: number;
  notes: string | null; profileId: number;
}

export interface DcaPlan {
  id: number; name: string; asset: string; amount: number;
  frequency: string; nextExecution: string | null; enabled: boolean;
  assetClass: string | null;
  autoExecute?: boolean; autoDayOfWeek?: number | null;
  autoStartDate?: string | null; broker?: string | null;
}

export interface DcaExecution {
  id: number; planId: number; amount: number; price: number | null;
  units: number | null; date: string; notes: string | null;
}

export interface WeekItem {
  label: string; start: string; end: string; target: number;
  executed: number; done: boolean; autoDone?: boolean;
  isCurrent: boolean; isPast: boolean; isFuture: boolean;
}

export interface PlanSchedule {
  planId: number; asset: string; name: string;
  isCrypto?: boolean; baseMonthly?: number; appliedMultiplier?: number;
  multiplierRule?: "crypto" | "equity" | "fixed";
  multiplierComponents?: {
    fgMult?: number; fundingBoost?: number; fundingRate?: number | null;
    basisBoost?: number; basisPct?: number | null; vixLevel?: number | null;
    gated?: "crypto_paused" | "asset_not_in_scope";
    gateContext?: Record<string, unknown>;
  };
  autoExecute?: boolean; autoDayOfWeek?: number | null; broker?: string | null;
  monthlyTarget: number; weeklyTarget: number;
  totalExecuted: number; remaining: number; onTrack: boolean;
  weeks: WeekItem[];
}

export interface ScheduleData {
  currentWeek: number; totalWeeks: number;
  weeklyBudget: number; thisWeekExecuted: number; thisWeekRemaining: number;
  fgValue?: number; fgMultiplier?: number;
  schedule: PlanSchedule[];
}

export interface Allocation {
  class: string; current: number; target: number; drift: number;
  currentValue: number; targetValue: number;
}

export interface HealthData {
  score: number; allocation: Allocation[];
  actions: { priority: number; icon: string; text: string; amount?: number }[];
  warnings: string[]; goalsProgress: Goal[];
  dcaSummary: { activePlans: number; totalMonthly: number; totalExecutions: number };
  emergency: { target: number; current: number; ok: boolean; surplus: number };
}

export interface MarketData {
  fearGreed: { value: number; label: string; timestamp: string | null };
  dcaMultiplier: { value: number; label: string };
  finances: {
    savingsRate: number; monthlyIncome: number; monthlyExpenses: number;
    monthlyInvestable: number; netWorth: number;
  };
}

export interface StrategyData {
  profile: StrategyProfile; goals: Goal[];
  plans: DcaPlan[]; executions: DcaExecution[];
}

export type ParentTab = "cash" | "etfs" | "crypto" | "gold" | "bonds" | "stocks";
export type SubTargetForm = { subClass: string; parentClass: ParentTab; targetPct: number };

export const ASSET_EMOJI: Record<string, string> = {
  BTC: "₿", ETH: "Ξ", SOL: "◎", "MSCI World": "🌍", "MSCI Momentum": "⚡",
  "Gold ETC": "🥇", "EU Infl Bond": "🛡️", MSFT: "💻",
};

export const PARENT_ORDER: ParentTab[] = ["cash", "etfs", "crypto", "gold", "bonds", "stocks"];

export const PARENT_LABEL: Record<ParentTab, string> = {
  cash: "Cash", etfs: "ETFs", crypto: "Crypto", gold: "Gold", bonds: "Bonds", stocks: "Stocks",
};

export const SUB_LABEL: Record<string, string> = {
  cash_yield: "Cash yield (stable + MMF)",
  etf_core: "ETF core (MSCI World)",
  etf_factor: "ETF factor (Momentum / Value / EM)",
  crypto_core: "Crypto core (BTC)",
  crypto_alt: "Crypto alt (ETH)",
  legacy_hold: "Legacy hold (SOL / PEPE — no aportar)",
  gold: "Gold ETC",
  bonds_infl: "Bonds (inflation-linked)",
  thematic_plays: "Thematic plays (stocks con tesis)",
};

export const SUBS_BY_PARENT: Record<ParentTab, string[]> = {
  cash: ["cash_yield"],
  etfs: ["etf_core", "etf_factor"],
  crypto: ["crypto_core", "crypto_alt", "legacy_hold"],
  gold: ["gold"],
  bonds: ["bonds_infl"],
  stocks: ["thematic_plays"],
};
