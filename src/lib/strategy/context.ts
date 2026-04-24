import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard/summary";
import { loadMultiplierContext, type MultiplierContext } from "@/lib/intel/multipliers";
import { getEurPerUsd } from "@/lib/currency-rates";
import { classifyAsset } from "@/lib/intel/allocation/classify";
import { computeCryptoAllocationPct } from "@/lib/strategy/market-multiplier";
import { parsePolicies, type StrategyPolicies } from "@/lib/strategy/policies";
import { emergencyTargetEur } from "@/lib/strategy/health-calc";
import type { EmergencyFundStatus } from "@/lib/strategy/types";

export interface StrategyContext {
  fgValue: number;
  fgTimestamp: string | null;
  policies: StrategyPolicies;
  cryptoAllocationPct: number;
  dashboard: DashboardSummary;
  mctx: MultiplierContext;
  emergencyFund: EmergencyFundStatus;
}

interface FgFetch {
  value: number;
  timestamp: string | null;
}

async function fetchFearGreed(): Promise<FgFetch> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 600 },
    });
    const j = await res.json();
    const row = j?.data?.[0];
    if (row) {
      return {
        value: parseInt(row.value, 10),
        timestamp: row.timestamp ?? null,
      };
    }
  } catch (e) {
    console.warn("[strategy/context] F&G fetch failed, defaulting to 50:", e);
  }
  return { value: 50, timestamp: null };
}

interface ActiveProfileFields {
  policies: StrategyPolicies;
  monthlyFixedExpenses: number;
  emergencyMonths: number;
}

async function loadActiveProfile(): Promise<ActiveProfileFields> {
  const [profile] = await db
    .select({
      policiesJson: schema.strategyProfiles.policiesJson,
      monthlyFixedExpenses: schema.strategyProfiles.monthlyFixedExpenses,
      emergencyMonths: schema.strategyProfiles.emergencyMonths,
    })
    .from(schema.strategyProfiles)
    .where(eq(schema.strategyProfiles.active, true))
    .limit(1);
  return {
    policies: parsePolicies(profile?.policiesJson ?? null),
    monthlyFixedExpenses: profile?.monthlyFixedExpenses ?? 0,
    emergencyMonths: profile?.emergencyMonths ?? 0,
  };
}

function computeCashValueUsd(portfolioAssets: DashboardSummary["portfolioAssets"]): number {
  return portfolioAssets.reduce((sum, a) => {
    return classifyAsset(a.symbol) === "cash" ? sum + (a.value || 0) : sum;
  }, 0);
}

export async function getStrategyContext(): Promise<StrategyContext> {
  const [fg, dashboard, profile, eurPerUsd] = await Promise.all([
    fetchFearGreed(),
    getDashboardSummary(),
    loadActiveProfile(),
    getEurPerUsd(),
  ]);
  const cryptoAllocationPct = computeCryptoAllocationPct(
    dashboard.portfolioAssets,
    dashboard.portfolio,
  );
  const mctx = await loadMultiplierContext(fg.value, { cryptoAllocationPct });

  // Emergency fund: target en EUR (fixed expenses en EUR). Cash portfolio
  // viene en USD → convertir para comparar en la misma moneda.
  const targetEur = emergencyTargetEur(profile);
  const cashUsd = computeCashValueUsd(dashboard.portfolioAssets);
  const currentEur = Math.round(cashUsd * eurPerUsd * 100) / 100;
  const shortfallEur = Math.max(0, Math.round((targetEur - currentEur) * 100) / 100);
  const emergencyFund: EmergencyFundStatus = {
    targetEur,
    currentEur,
    ok: currentEur >= targetEur,
    shortfallEur,
  };

  return {
    fgValue: fg.value,
    fgTimestamp: fg.timestamp,
    policies: profile.policies,
    cryptoAllocationPct,
    dashboard,
    mctx,
    emergencyFund,
  };
}
