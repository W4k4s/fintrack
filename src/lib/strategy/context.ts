import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard/summary";
import { loadMultiplierContext, type MultiplierContext } from "@/lib/intel/multipliers";
import { computeCryptoAllocationPct } from "@/lib/strategy/market-multiplier";
import { parsePolicies, type StrategyPolicies } from "@/lib/strategy/policies";

export interface StrategyContext {
  fgValue: number;
  fgTimestamp: string | null;
  policies: StrategyPolicies;
  cryptoAllocationPct: number;
  dashboard: DashboardSummary;
  mctx: MultiplierContext;
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

async function loadActivePolicies(): Promise<StrategyPolicies> {
  const [profile] = await db
    .select({ policiesJson: schema.strategyProfiles.policiesJson })
    .from(schema.strategyProfiles)
    .where(eq(schema.strategyProfiles.active, true))
    .limit(1);
  return parsePolicies(profile?.policiesJson ?? null);
}

export async function getStrategyContext(): Promise<StrategyContext> {
  const [fg, dashboard, policies] = await Promise.all([
    fetchFearGreed(),
    getDashboardSummary(),
    loadActivePolicies(),
  ]);
  const cryptoAllocationPct = computeCryptoAllocationPct(
    dashboard.portfolioAssets,
    dashboard.portfolio,
  );
  const mctx = await loadMultiplierContext(fg.value, { cryptoAllocationPct });
  return {
    fgValue: fg.value,
    fgTimestamp: fg.timestamp,
    policies,
    cryptoAllocationPct,
    dashboard,
    mctx,
  };
}
