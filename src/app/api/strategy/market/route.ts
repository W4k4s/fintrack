import { NextResponse } from "next/server";
import { getEurPerUsd } from "@/lib/currency-rates";
import {
  applyPolicyGate,
  getRawDcaMultiplier,
} from "@/lib/strategy/market-multiplier";
import { getStrategyContext } from "@/lib/strategy/context";

// Fetches live market context:
// - Crypto Fear & Greed Index (alternative.me)
// - Savings rate + monthly investable from recent expenses
// - DCA multiplier derived from sentiment + strategy policies (R1 SSOT)

function getFgLabel(fg: number): string {
  if (fg <= 24) return "Miedo extremo";
  if (fg <= 44) return "Miedo";
  if (fg <= 55) return "Neutral";
  if (fg <= 74) return "Codicia";
  return "Codicia extrema";
}

export async function GET() {
  const { fgValue, fgTimestamp, policies, cryptoAllocationPct, dashboard } =
    await getStrategyContext();

  const fgLabel = getFgLabel(fgValue);

  const raw = getRawDcaMultiplier(fgValue, policies.multiplier.fgThreshold);
  const { multiplier: dcaMultiplier, label: multiplierLabel } = applyPolicyGate(raw, policies, cryptoAllocationPct);

  // Savings rate — last 90 days from expenses
  let savingsRate = 0;
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  let netWorth = 0;
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const toStr = to.toISOString().split("T")[0];
    const fromStr = from.toISOString().split("T")[0];

    const expRes = await fetch(
      `http://localhost:3000/api/expenses?from=${fromStr}&to=${toStr}`,
      { cache: "no-store" }
    );
    const exp = await expRes.json();
    const s = exp.summary || {};
    savingsRate = Math.round((s.savingsRate || 0) * 10) / 10;
    monthlyIncome = Math.round((s.totalIncome || 0) / 3);
    monthlyExpenses = Math.round((s.totalExpenses || 0) / 3);

    const eurRate = await getEurPerUsd();
    netWorth = Math.round((dashboard.netWorth || 0) * eurRate);
  } catch (e) {
    console.error("Expenses fetch failed:", e);
  }

  const monthlyInvestable = Math.max(0, monthlyIncome - monthlyExpenses);

  return NextResponse.json({
    fearGreed: {
      value: fgValue,
      label: fgLabel,
      timestamp: fgTimestamp,
    },
    dcaMultiplier: {
      value: dcaMultiplier,
      label: multiplierLabel,
    },
    finances: {
      savingsRate,
      monthlyIncome,
      monthlyExpenses,
      monthlyInvestable,
      netWorth,
    },
  });
}
