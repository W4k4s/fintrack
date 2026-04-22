import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getEurPerUsd } from "@/lib/currency-rates";
import { effectiveGoalTarget, emergencyTargetEur } from "@/lib/strategy/health-calc";

// Asset class mapping
const ASSET_CLASS_MAP: Record<string, string> = {
  EUR: "cash", USDC: "cash", USDT: "cash",
  BTC: "crypto", ETH: "crypto", SOL: "crypto", PEPE: "crypto",
  XCH: "crypto", SHIB: "crypto", BNB: "crypto", ROSE: "crypto",
  MANA: "crypto", S: "crypto", GPU: "crypto",
  "MSCI World": "etfs", "MSCI Momentum": "etfs",
  "Gold ETC": "gold",
  "EU Infl Bond": "bonds",
  MSFT: "stocks",
};

export async function GET() {
  try {
    // Get strategy profile
    const profiles = await db.select().from(schema.strategyProfiles).limit(1);
    if (!profiles.length) return NextResponse.json({ score: 0, warnings: ["No strategy configured"] });
    const profile = profiles[0];

    // Get portfolio from dashboard
    const dashRes = await fetch("http://localhost:3000/api/dashboard/summary");
    const dash = await dashRes.json();
    const portfolioAssets = dash.portfolioAssets || [];
    const netWorth = dash.netWorth || 0;
    const eurRate = await getEurPerUsd();

    // Calculate current allocation by class
    const totalPortfolio = dash.portfolio || 0;
    const classTotals: Record<string, number> = { cash: 0, etfs: 0, crypto: 0, gold: 0, bonds: 0, stocks: 0 };
    for (const a of portfolioAssets) {
      const cls = ASSET_CLASS_MAP[a.symbol] || "other";
      if (cls in classTotals) classTotals[cls] += a.value || 0;
    }

    // Allocation percentages
    const current: Record<string, number> = {};
    for (const [k, v] of Object.entries(classTotals)) {
      current[k] = totalPortfolio > 0 ? (v / totalPortfolio) * 100 : 0;
    }

    const targets: Record<string, number> = {
      cash: profile.targetCash, etfs: profile.targetEtfs, crypto: profile.targetCrypto,
      gold: profile.targetGold, bonds: profile.targetBonds, stocks: profile.targetStocks,
    };

    // Calculate drift and score
    let driftPenalty = 0;
    const allocation: { class: string; current: number; target: number; drift: number; currentValue: number; targetValue: number }[] = [];
    const warnings: string[] = [];
    const actions: { priority: number; icon: string; text: string; amount?: number }[] = [];

    for (const cls of Object.keys(targets)) {
      const drift = current[cls] - targets[cls];
      const absDrift = Math.abs(drift);
      driftPenalty += absDrift;
      allocation.push({
        class: cls,
        current: Math.round(current[cls] * 10) / 10,
        target: targets[cls],
        drift: Math.round(drift * 10) / 10,
        currentValue: Math.round(classTotals[cls] * 100) / 100,
        targetValue: Math.round(totalPortfolio * targets[cls] / 100 * 100) / 100,
      });

      if (absDrift > 15) {
        warnings.push(`${cls.toUpperCase()} drift crítico: ${drift > 0 ? "+" : ""}${drift.toFixed(1)}%`);
      }
      if (drift < -5) {
        const neededEur = Math.round(((targets[cls] - current[cls]) / 100 * totalPortfolio) * eurRate);
        const classLabelMap: Record<string, string> = {
          cash: "Cash", etfs: "ETFs", crypto: "Crypto",
          gold: "Oro", bonds: "Bonos", stocks: "Acciones",
        };
        actions.push({
          priority: absDrift > 15 ? 1 : 2,
          icon: absDrift > 15 ? "🔴" : "🔵",
          text: `Comprar ${classLabelMap[cls] || cls}: te faltan €${neededEur.toLocaleString("es-ES")} para alcanzar el objetivo`,
          amount: neededEur,
        });
      }
    }

    // Emergency fund check — R1: usa profile.monthlyFixedExpenses (SSOT).
    // emergencyTargetEur devuelve EUR (fixed expenses se guardan en EUR);
    // el portfolio viene en USD y multiplica por eurRate al retornar.
    const emergencyTargetValueEur = emergencyTargetEur(profile);
    const emergencyTarget = emergencyTargetValueEur / (eurRate || 1); // a USD para comparar con cashValue USD
    const cashValue = classTotals.cash;
    const emergencyOk = cashValue >= emergencyTarget;
    const deployCash = cashValue - emergencyTarget;

    if (deployCash > 500) {
      actions.push({
        priority: 1,
        icon: "🟢",
        text: `Desplegar €${Math.round(deployCash * eurRate)} de cash excedente (sobre fondo de emergencia)`,
        amount: Math.round(deployCash * eurRate),
      });
    }

    // DCA status
    const plans = await db.select().from(schema.investmentPlans);
    const activePlans = plans.filter(p => p.enabled);
    const totalDCA = activePlans.reduce((s, p) => s + p.amount, 0);

    if (activePlans.length === 0) {
      warnings.push("Sin DCA plans activos — estás invirtiendo manualmente");
    }

    // Check executions
    const executions = await db.select().from(schema.dcaExecutions);
    const plansWithNoExec = activePlans.filter(p => !executions.some(e => e.planId === p.id));
    if (plansWithNoExec.length > 0) {
      actions.push({
        priority: 1,
        icon: "⚠️",
        text: `${plansWithNoExec.length} DCA plan(s) sin ejecutar todavía: ${plansWithNoExec.map(p => p.asset).join(", ")}`,
      });
    }

    // Score (0-100)
    let score = 100;
    score -= Math.min(driftPenalty * 0.5, 40); // max -40 for drift
    if (!emergencyOk) score -= 15;
    if (activePlans.length === 0) score -= 20;
    if (plansWithNoExec.length > 0) score -= Math.min(plansWithNoExec.length * 3, 15);
    score = Math.max(0, Math.round(score));

    // Goals progress
    const goals = await db.select().from(schema.strategyGoals)
      .where(eq(schema.strategyGoals.profileId, profile.id));

    const goalsProgress = goals.map(g => {
      let currentValue = 0;
      if (g.type === "net_worth") {
        currentValue = netWorth * eurRate;
      } else if (g.type === "emergency_fund") {
        currentValue = cashValue * eurRate;
      } else if (g.type === "asset_target" && g.targetAsset) {
        const asset = portfolioAssets.find((a: { symbol: string }) => a.symbol === g.targetAsset);
        if (asset) {
          currentValue = g.targetUnit === "units" ? asset.amount : asset.value * eurRate;
        }
      }
      // R1: emergency_fund usa target derivado (SSOT), resto usa goal.targetValue.
      const effectiveTarget = effectiveGoalTarget(g, profile);
      const progress = effectiveTarget > 0 ? Math.min((currentValue / effectiveTarget) * 100, 100) : 0;
      return {
        ...g,
        targetValue: effectiveTarget,
        currentValue: Math.round(currentValue * 100) / 100,
        progress: Math.round(progress),
      };
    });

    // Sort actions by priority
    actions.sort((a, b) => a.priority - b.priority);

    return NextResponse.json({
      score,
      allocation,
      actions,
      warnings,
      goalsProgress,
      dcaSummary: {
        activePlans: activePlans.length,
        totalMonthly: totalDCA,
        totalExecutions: executions.length,
      },
      emergency: {
        target: Math.round(emergencyTarget * eurRate),
        current: Math.round(cashValue * eurRate),
        ok: emergencyOk,
        surplus: Math.round(deployCash * eurRate),
      },
    });
  } catch (err) {
    console.error("Strategy health error:", err);
    return NextResponse.json({ score: 0, warnings: ["Error calculating health"] }, { status: 500 });
  }
}
