import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// Generate weekly schedule from monthly DCA plans.
// For crypto plans we apply the Fear & Greed multiplier automatically
// (F&G is a crypto sentiment index — doesn't make sense to boost equities with it).

const CRYPTO_ASSETS = new Set([
  "BTC", "ETH", "SOL", "PEPE", "XCH", "SHIB", "BNB", "ROSE", "MANA", "S", "GPU",
  "USDC", "USDT",
]);

function isCryptoPlan(plan: { asset: string; assetClass: string | null }): boolean {
  if (plan.assetClass === "crypto") return true;
  return CRYPTO_ASSETS.has(plan.asset);
}

function getFgMultiplier(fg: number): number {
  if (fg <= 24) return 2.0;
  if (fg <= 44) return 1.5;
  if (fg <= 55) return 1.0;
  if (fg <= 74) return 0.75;
  return 0.5;
}

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
    const activePlans = plans.filter(p => p.enabled);
    const executions = await db.select().from(schema.dcaExecutions);

    const fgValue = await getFgValue();
    const fgMultiplier = getFgMultiplier(fgValue);

    const now = new Date();
    const { monday: thisMonday, sunday: thisSunday } = getWeekBounds(now);
    const weeks = getMonthWeeks(now.getFullYear(), now.getMonth());
    const currentWeekIdx = weeks.findIndex(w => now >= w.start && now <= w.end);

    // Day of week 1=Mon..7=Sun (matching autoDayOfWeek convention)
    const todayDow = ((now.getDay() + 6) % 7) + 1;

    const schedule = activePlans.map(plan => {
      const isCrypto = isCryptoPlan(plan);
      const effectiveMonthly = isCrypto ? plan.amount * fgMultiplier : plan.amount;
      const weeklyAmount = Math.round((effectiveMonthly / 4) * 100) / 100;

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const monthExecs = executions.filter(e =>
        e.planId === plan.id && e.date >= monthStart && e.date <= monthEnd,
      );
      const totalExecuted = monthExecs.reduce((s, e) => s + e.amount, 0);
      const remaining = Math.max(0, effectiveMonthly - totalExecuted);

      const autoEnabled = !!plan.autoExecute && plan.autoDayOfWeek != null;
      const autoStartDate = plan.autoStartDate || null;

      const weeklySchedule = weeks.map((week, i) => {
        const weekStart = week.start.toISOString().split("T")[0];
        const weekEnd = week.end.toISOString().split("T")[0];
        const weekExecs = monthExecs.filter(e => e.date >= weekStart && e.date <= weekEnd);
        const weekExecuted = weekExecs.reduce((s, e) => s + e.amount, 0);
        const realDone = weekExecuted >= weeklyAmount * 0.9;
        const isCurrent = i === currentWeekIdx;
        const isPast = week.end < now;

        // Auto-done: the broker plan fires on autoDayOfWeek. If the day has passed
        // (or it's past week), assume the plan executed even without a recorded execution yet.
        // BUT only if we're at/after the autoStartDate (plan futuro).
        let autoDone = false;
        const autoActiveThisWeek = autoEnabled
          && (!autoStartDate || weekStart >= autoStartDate);
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
        name: plan.name,
        isCrypto,
        baseMonthly: plan.amount,
        monthlyTarget: Math.round(effectiveMonthly * 100) / 100,
        weeklyTarget: weeklyAmount,
        appliedMultiplier: isCrypto ? fgMultiplier : 1.0,
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
    const thisWeekExecuted = executions.filter(e =>
      e.date >= thisMonday.toISOString().split("T")[0]
      && e.date <= thisSunday.toISOString().split("T")[0],
    ).reduce((s, e) => s + e.amount, 0);

    return NextResponse.json({
      currentWeek: currentWeekIdx + 1,
      totalWeeks: weeks.length,
      weeklyBudget: Math.round(totalWeekly * 100) / 100,
      thisWeekExecuted: Math.round(thisWeekExecuted * 100) / 100,
      thisWeekRemaining: Math.round(Math.max(0, totalWeekly - thisWeekExecuted) * 100) / 100,
      fgValue,
      fgMultiplier,
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
