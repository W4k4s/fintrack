import { NextResponse } from "next/server";
import { getEurPerUsd } from "@/lib/currency-rates";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { parsePolicies, type StrategyPolicies } from "@/lib/strategy/policies";

// Fetches live market context:
// - Crypto Fear & Greed Index (alternative.me)
// - Savings rate + monthly investable from recent expenses
// - DCA multiplier derived from sentiment + strategy policies (R1 SSOT)

function getRawDcaMultiplier(fg: number, fgThreshold: number): { multiplier: number; label: string } {
  if (fg <= fgThreshold) return { multiplier: 2.0, label: "Doblar compras (miedo extremo)" };
  if (fg <= 44) return { multiplier: 1.5, label: "Aumentar (miedo)" };
  if (fg <= 55) return { multiplier: 1.0, label: "Ritmo normal" };
  if (fg <= 74) return { multiplier: 0.75, label: "Reducir (codicia)" };
  return { multiplier: 0.5, label: "Tomar beneficios (codicia extrema)" };
}

function applyPolicyGate(
  raw: { multiplier: number; label: string },
  policies: StrategyPolicies,
  cryptoAllocationPct: number,
): { multiplier: number; label: string } {
  // Si la allocation crypto supera el umbral, el multiplier queda en 1.0 y se
  // comunica explícitamente que la política de transición manda sobre F&G.
  if (cryptoAllocationPct >= policies.multiplier.requiresCryptoUnderPct) {
    return {
      multiplier: 1.0,
      label: `Pausado (crypto ${cryptoAllocationPct.toFixed(1)}% ≥ ${policies.multiplier.requiresCryptoUnderPct}%)`,
    };
  }
  // Si el boost sólo aplica a un subset (p. ej. ["BTC"]), lo reflejamos en el
  // label para que la UI no prometa ×2 global.
  if (raw.multiplier > 1.0 && policies.multiplier.appliesTo.length > 0) {
    const assets = policies.multiplier.appliesTo.join(", ");
    return { ...raw, label: `${raw.label} — sólo ${assets}` };
  }
  return raw;
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

  // R1: leer profile + policies + allocation crypto para gatear el multiplier.
  const [profile] = await db
    .select({
      policiesJson: schema.strategyProfiles.policiesJson,
    })
    .from(schema.strategyProfiles)
    .where(eq(schema.strategyProfiles.active, true))
    .limit(1);
  const policies = parsePolicies(profile?.policiesJson ?? null);

  let cryptoAllocationPct = 0;
  try {
    const dashRes = await fetch("http://localhost:3000/api/dashboard/summary", { cache: "no-store" });
    const dash = await dashRes.json();
    const portfolioAssets: Array<{ symbol: string; value?: number }> = dash.portfolioAssets || [];
    const totalPortfolio = dash.portfolio || 0;
    const CRYPTO_SYMBOLS = new Set(["BTC", "ETH", "SOL", "PEPE", "XCH", "SHIB", "BNB", "ROSE", "MANA", "S", "GPU"]);
    const cryptoValue = portfolioAssets.filter((a) => CRYPTO_SYMBOLS.has(a.symbol)).reduce((s, a) => s + (a.value || 0), 0);
    cryptoAllocationPct = totalPortfolio > 0 ? (cryptoValue / totalPortfolio) * 100 : 0;
  } catch (e) {
    console.warn("[market] crypto allocation fetch failed, assume 0:", e);
  }

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
