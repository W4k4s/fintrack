// Derivaciones puras para el payload de /api/strategy/schedule.
// Antes vivían repartidas entre el route y el cliente (weekly-shopping-list,
// strategy/page, guide). Movidas aquí como SSOT para que todas las vistas
// consuman el mismo resultado y los tests cubran los invariantes.

import type { InvestmentPlan } from "@/lib/db/schema";
import { classifyAsset, type AssetClass } from "@/lib/intel/allocation/classify";
import {
  multiplierFor,
  type AppliedMultiplier,
  type MultiplierContext,
} from "@/lib/intel/multipliers";
import type { StrategyPolicies } from "@/lib/strategy/policies";
import type {
  EmergencyFundStatus,
  PauseReason,
  ScheduleData,
  ScheduleItem,
  ScheduleMarketContext,
  WeekItem,
} from "@/lib/strategy/types";

// -- Calendario semanal -----------------------------------------------------

export function getWeekBounds(date: Date): { monday: Date; sunday: Date } {
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

export function getMonthWeeks(year: number, month: number): { start: Date; end: Date; label: string }[] {
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

// -- Labels resueltas -------------------------------------------------------

// Orden de prioridad si coinciden varios: survival first (fondo) > policy
// crypto (allocation) > scope (asset individual).
function resolvePauseReason(
  applied: AppliedMultiplier,
  emergencyFundOk: boolean,
): PauseReason | null {
  if (!emergencyFundOk) return "emergency_fund_incomplete";
  return applied.components.gated ?? null;
}

function actionLabelFor(opts: {
  displayAmount: number;
  done: boolean;
  pauseReason: PauseReason | null;
  autoPending: boolean;
}): string {
  if (opts.pauseReason === "emergency_fund_incomplete") return "Pausado (fondo emergencia)";
  if (opts.pauseReason === "crypto_paused") return "Pausado (policy crypto)";
  if (opts.pauseReason === "asset_not_in_scope") return "Fuera de scope";
  if (opts.done) return "Hecho";
  const amount = `€${opts.displayAmount.toFixed(2)}`;
  return opts.autoPending ? `Ejecutar ahora ${amount}` : `Ejecutar ${amount}`;
}

// -- Derivación de un plan individual ---------------------------------------

export interface DeriveDeps {
  mctx: MultiplierContext;
  policies: StrategyPolicies;
  now: Date;
  emergencyFundOk: boolean;
}

export function deriveScheduleItem(
  plan: InvestmentPlan,
  allExecutions: { planId: number; date: string; amount: number }[],
  deps: DeriveDeps,
): ScheduleItem {
  const { mctx, policies, now, emergencyFundOk } = deps;
  const todayStr = now.toISOString().slice(0, 10);

  const cls = (plan.assetClass as AssetClass) || classifyAsset(plan.asset);
  const applied = multiplierFor(cls, plan.asset, mctx, policies);

  const effectiveMonthly = plan.amount * applied.value;
  const weeklyAmount = Math.round((effectiveMonthly / 4) * 100) / 100;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const monthExecs = allExecutions.filter(
    (e) => e.planId === plan.id && e.date >= monthStart && e.date <= monthEnd,
  );
  const totalExecuted = monthExecs.reduce((s, e) => s + e.amount, 0);
  // ≥99% ≈ redondeo de TR al ejecutar (units×price vs amount tecleado): el
  // residuo de céntimos (335€ → 334,97€) no se considera pendiente.
  const executedRatio = effectiveMonthly > 0 ? totalExecuted / effectiveMonthly : 1;
  const remaining = executedRatio >= 0.99 ? 0 : Math.max(0, effectiveMonthly - totalExecuted);

  const autoEnabled = !!plan.autoExecute && plan.autoDayOfWeek != null;
  const autoStartDate = plan.autoStartDate || null;

  // Week-by-week
  const weeks = getMonthWeeks(now.getFullYear(), now.getMonth());
  const currentWeekIdx = weeks.findIndex((w) => now >= w.start && now <= w.end);
  const todayDow = ((now.getDay() + 6) % 7) + 1;

  // Si el mes ya está cubierto en agregado (ratio ≥99%) significa que el
  // batch real (típicamente TR mensual) cayó concentrado en una semana y
  // las pasadas no tienen ejecuciones individualmente, pero sí están
  // "cubiertas por el mes". Marcamos esas como done para que el timeline
  // refleje la realidad y no muestre S1-S3 grises con S4 verde aunque el
  // total sea 100%.
  const monthCovered = executedRatio >= 0.99;

  const weeklySchedule: WeekItem[] = weeks.map((week, i) => {
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

    const coveredByMonth = monthCovered && (isPast || isCurrent);
    return {
      label: week.label,
      start: weekStart,
      end: weekEnd,
      target: weeklyAmount,
      executed: Math.round(weekExecuted * 100) / 100,
      done: realDone || autoDone || coveredByMonth,
      autoDone: autoDone && !realDone,
      isCurrent,
      isPast,
      isFuture: week.start > now,
    };
  });

  const currentWeek = weeklySchedule.find((w) => w.isCurrent);

  // Derivaciones cliente → servidor
  const autoPending = autoEnabled && !!autoStartDate && autoStartDate > todayStr;
  const monthRemaining = Math.round(remaining * 100) / 100;
  const displayAmount = autoPending ? monthRemaining : weeklyAmount;
  const done = autoPending ? monthRemaining === 0 : !!currentWeek?.done;
  const pauseReason = resolvePauseReason(applied, emergencyFundOk);
  const actionLabel = actionLabelFor({ displayAmount, done, pauseReason, autoPending });

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
    remaining: monthRemaining,
    monthRemaining,
    onTrack: totalExecuted >= weeklyAmount * (currentWeekIdx + 1) * 0.8,
    weeks: weeklySchedule,
    autoPending,
    displayAmount,
    done,
    pauseReason,
    actionLabel,
  };
}

// -- Build del payload completo --------------------------------------------

export interface BuildScheduleDeps extends DeriveDeps {
  fgValue: number;
  emergencyFund: EmergencyFundStatus;
}

export function buildSchedule(
  activePlans: InvestmentPlan[],
  executions: { planId: number; date: string; amount: number }[],
  deps: BuildScheduleDeps,
): ScheduleData {
  const { now, mctx, fgValue, emergencyFund } = deps;
  const { monday: thisMonday, sunday: thisSunday } = getWeekBounds(now);
  const weeks = getMonthWeeks(now.getFullYear(), now.getMonth());
  const currentWeekIdx = weeks.findIndex((w) => now >= w.start && now <= w.end);

  const schedule = activePlans.map((plan) => deriveScheduleItem(plan, executions, deps));

  const totalWeekly = schedule.reduce((s, p) => s + p.weeklyTarget, 0);
  const thisWeekExecuted = executions
    .filter(
      (e) =>
        e.date >= thisMonday.toISOString().split("T")[0]
        && e.date <= thisSunday.toISOString().split("T")[0],
    )
    .reduce((s, e) => s + e.amount, 0);

  const marketContext: ScheduleMarketContext = {
    fg: mctx.fg,
    btcFunding: mctx.fundingByAsset.get("BTC")?.rate ?? null,
    ethFunding: mctx.fundingByAsset.get("ETH")?.rate ?? null,
    vixLevel: mctx.vix?.level ?? null,
    vixChangePct: mctx.vix?.changePct ?? null,
    basisBtcPct: mctx.basisBtc?.basisPct ?? null,
    basisBtcDaysToExpiry: mctx.basisBtc?.daysToExpiry ?? null,
  };

  return {
    currentWeek: currentWeekIdx + 1,
    totalWeeks: weeks.length,
    weeklyBudget: Math.round(totalWeekly * 100) / 100,
    thisWeekExecuted: Math.round(thisWeekExecuted * 100) / 100,
    thisWeekRemaining: Math.round(Math.max(0, totalWeekly - thisWeekExecuted) * 100) / 100,
    fgValue,
    marketContext,
    emergencyFund,
    schedule,
    weeks: weeks.map((w, i) => ({
      label: w.label,
      start: w.start.toISOString().split("T")[0],
      end: w.end.toISOString().split("T")[0],
      isCurrent: i === currentWeekIdx,
    })),
  };
}
