import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { classifyAsset } from "@/lib/intel/allocation/classify";
import { loadMultiplierContext, multiplierFor } from "@/lib/intel/multipliers";
import { parsePolicies } from "@/lib/strategy/policies";
import { computeCryptoAllocationPct } from "@/lib/strategy/market-multiplier";

// Generate weekly schedule from monthly DCA plans.
// Multiplicador adaptativo por clase (Phase 3.4):
// - Crypto → F&G base + funding boost (Binance perps BTC/ETH)
// - ETFs / Stocks → VIX (stress equity)
// - Gold / Bonds / Cash → 1.0x (DCA mecánico, sin señal que lo justifique)

function getWeekBounds(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function getMonthWeeks(year: number, month: number) {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const current = new Date(firstDay);
  const dow = current.getDay();
  if (dow !== 1) current.setDate(current.getDate() - (dow === 0 ? 6 : dow - 1));

  let weekNum = 1;
  while (current <= lastDay || weekNum <= 4) {
    const start = new Date(current);
    const end = new Date(current);
    end.setDate(end.getDate() + 6);
    weeks.push({ start, end, label: `Semana ${weekNum}` });
    current.setDate(current.getDate() + 7);
    weekNum++;
    if (weekNum > 5) break;
  }
  return weeks;
}

async function getFgValue(): Promise<number> {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 600 },
    });
    const j = await r.json();
    if (j.data?.[0]) return parseInt(j.data[0].value, 10);
  } catch {}
  return 50;
}

export async function GET() {
  try {
    const plans = await db.select().from(schema.investmentPlans);
    const activePlans = plans.filter((p) => p.enabled);
    const executions = await db.select().from(schema.dcaExecutions);

    const fgValue = await getFgValue();

    // R3: leer policies + allocation crypto actual para que multiplierFor
    // aplique los gates (crypto_paused / asset_not_in_scope).
    const [profile] = await db
      .select({ policiesJson: schema.strategyProfiles.policiesJson })
      .from(schema.strategyProfiles)
      .where(eq(schema.strategyProfiles.active, true))
      .limit(1);
    const policies = parsePolicies(profile?.policiesJson ?? null);

    let cryptoAllocationPct = 0;
    try {
      const dashRes = await fetch("http://localhost:3000/api/dashboard/summary", { cache: "no-store" });
      const dash = await dashRes.json();
      cryptoAllocationPct = computeCryptoAllocationPct(dash.portfolioAssets ?? [], dash.portfolio ?? 0);
    } catch (e) {
      console.warn("[schedule] crypto allocation fetch failed, assume 0:", e);
    }

    const mctx = await loadMultiplierContext(fgValue, { cryptoAllocationPct });

    const now = new Date();
    const { monday: thisMonday, sunday: thisSunday } = getWeekBounds(now);
    const weeks = getMonthWeeks(now.getFullYear(), now.getMonth());
    const currentWeekIdx = weeks.findIndex((w) => now >= w.start && now <= w.end);

    const todayDow = ((now.getDay() + 6) % 7) + 1;

    const schedule = activePlans.map((plan) => {
      const cls = (plan.assetClass as ReturnType<typeof classifyAsset>) || classifyAsset(plan.asset);
      const applied = multiplierFor(cls, plan.asset, mctx, policies);

      const effectiveMonthly = plan.amount * applied.value;
      const weeklyAmount = Math.round((effectiveMonthly / 4) * 100) / 100;

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const monthExecs = executions.filter(
        (e) => e.planId === plan.id && e.date >= monthStart && e.date <= monthEnd,
      );
      const totalExecuted = monthExecs.reduce((s, e) => s + e.amount, 0);
      const remaining = Math.max(0, effectiveMonthly - totalExecuted);

      const autoEnabled = !!plan.autoExecute && plan.autoDayOfWeek != null;
      const autoStartDate = plan.autoStartDate || null;

      const weeklySchedule = weeks.map((week, i) => {
        const weekStart = week.start.toISOString().split("T")[0];
        const weekEnd = week.end.toISOString().split("T")[0];
        const weekExecs = monthExecs.filter((e) => e.date >= weekStart && e.date <= weekEnd);
        const weekExecuted = weekExecs.reduce((s, e) => s + e.amount, 0);
        const realDone = weekExecuted >= weeklyAmount * 0.9;
        const isCurrent = i === currentWeekIdx;
        const isPast = week.end < now;

        let autoDone = false;
        const autoActiveThisWeek = autoEnabled && (!autoStartDate || weekStart >= autoStartDate);
        if (autoActiveThisWeek && !realDone) {
          if (isPast) autoDone = true;
          else if (isCurrent && plan.autoDayOfWeek! <= todayDow) autoDone = true;
        }

        return {
          label: week.label,
          start: weekStart,
          end: weekEnd,
          target: weeklyAmount,
          executed: Math.round(weekExecuted * 100) / 100,
          done: realDone || autoDone,
          autoDone: autoDone && !realDone,
          isCurrent,
          isPast,
          isFuture: week.start > now,
        };
      });

      return {
        planId: plan.id,
        asset: plan.asset,
        assetClass: cls,
        name: plan.name,
        isCrypto: applied.rule === "crypto",
        baseMonthly: plan.amount,
        monthlyTarget: Math.round(effectiveMonthly * 100) / 100,
        weeklyTarget: weeklyAmount,
        appliedMultiplier: Math.round(applied.value * 100) / 100,
        multiplierRule: applied.rule,
        multiplierComponents: applied.components,
        autoExecute: autoEnabled,
        autoDayOfWeek: plan.autoDayOfWeek || null,
        autoStartDate,
        broker: plan.broker || null,
        totalExecuted: Math.round(totalExecuted * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        onTrack: totalExecuted >= weeklyAmount * (currentWeekIdx + 1) * 0.8,
        weeks: weeklySchedule,
      };
    });

    const totalWeekly = schedule.reduce((s, p) => s + p.weeklyTarget, 0);
    const thisWeekExecuted = executions
      .filter(
        (e) =>
          e.date >= thisMonday.toISOString().split("T")[0]
          && e.date <= thisSunday.toISOString().split("T")[0],
      )
      .reduce((s, e) => s + e.amount, 0);

    // Summary multipliers (reference values — UI may display them).
    const fgMultExample = mctx.fg; // raw value for display
    const btcFunding = mctx.fundingByAsset.get("BTC")?.rate ?? null;
    const ethFunding = mctx.fundingByAsset.get("ETH")?.rate ?? null;

    return NextResponse.json({
      currentWeek: currentWeekIdx + 1,
      totalWeeks: weeks.length,
      weeklyBudget: Math.round(totalWeekly * 100) / 100,
      thisWeekExecuted: Math.round(thisWeekExecuted * 100) / 100,
      thisWeekRemaining: Math.round(Math.max(0, totalWeekly - thisWeekExecuted) * 100) / 100,
      fgValue,
      // backwards-compat: mantengo fgMultiplier como el F&G base puro (lo que la UI antigua esperaba).
      fgMultiplier: (() => {
        if (fgMultExample <= 24) return 2.0;
        if (fgMultExample <= 44) return 1.5;
        if (fgMultExample <= 55) return 1.0;
        if (fgMultExample <= 74) return 0.75;
        return 0.5;
      })(),
      marketContext: {
        fg: mctx.fg,
        btcFunding,
        ethFunding,
        vixLevel: mctx.vix?.level ?? null,
        vixChangePct: mctx.vix?.changePct ?? null,
        basisBtcPct: mctx.basisBtc?.basisPct ?? null,
        basisBtcDaysToExpiry: mctx.basisBtc?.daysToExpiry ?? null,
      },
      schedule,
      weeks: weeks.map((w, i) => ({
        ...w,
        start: w.start.toISOString().split("T")[0],
        end: w.end.toISOString().split("T")[0],
        isCurrent: i === currentWeekIdx,
      })),
    });
  } catch (err) {
    console.error("Schedule error:", err);
    return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 });
  }
}
