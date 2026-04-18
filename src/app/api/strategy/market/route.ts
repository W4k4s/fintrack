import { NextResponse } from "next/server";
import { getEurPerUsd } from "@/lib/currency-rates";

// Fetches live market context:
// - Crypto Fear & Greed Index (alternative.me)
// - Savings rate + monthly investable from recent expenses
// - DCA multiplier derived from sentiment

function getDcaMultiplier(fg: number): { multiplier: number; label: string } {
  if (fg <= 24) return { multiplier: 2.0, label: "Doblar compras (miedo extremo)" };
  if (fg <= 44) return { multiplier: 1.5, label: "Aumentar (miedo)" };
  if (fg <= 55) return { multiplier: 1.0, label: "Ritmo normal" };
  if (fg <= 74) return { multiplier: 0.75, label: "Reducir (codicia)" };
  return { multiplier: 0.5, label: "Tomar beneficios (codicia extrema)" };
}

function getFgLabel(fg: number): string {
  if (fg <= 24) return "Miedo extremo";
  if (fg <= 44) return "Miedo";
  if (fg <= 55) return "Neutral";
  if (fg <= 74) return "Codicia";
  return "Codicia extrema";
}

export async function GET() {
  // Fear & Greed
  let fgValue = 50;
  let fgTimestamp: string | null = null;
  try {
    const fgRes = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 600 }, // cache 10 min
    });
    const fgJson = await fgRes.json();
    if (fgJson.data?.[0]) {
      fgValue = parseInt(fgJson.data[0].value, 10);
      fgTimestamp = fgJson.data[0].timestamp;
    }
  } catch (e) {
    console.error("F&G fetch failed:", e);
  }

  const fgLabel = getFgLabel(fgValue);
  const { multiplier: dcaMultiplier, label: multiplierLabel } = getDcaMultiplier(fgValue);

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

    const dashRes = await fetch("http://localhost:3000/api/dashboard/summary", {
      cache: "no-store",
    });
    const dash = await dashRes.json();
    const eurRate = await getEurPerUsd();
    netWorth = Math.round((dash.netWorth || 0) * eurRate);
  } catch (e) {
    console.error("Expenses/dashboard fetch failed:", e);
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
