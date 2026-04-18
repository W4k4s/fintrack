"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useCurrency } from "@/components/currency-provider";
import {
  Target, Shield, AlertTriangle, CheckCircle2,
  Plus, ChevronDown, ChevronUp, PiggyBank,
  Clock, Edit3, X, Check, ShoppingCart, Activity,
  Info, TrendingUp, BookOpen, Zap,
} from "lucide-react";

interface StrategyProfile {
  id: number; name: string; riskProfile: string;
  targetCash: number; targetEtfs: number; targetCrypto: number;
  targetGold: number; targetBonds: number; targetStocks: number;
  monthlyInvest: number; emergencyMonths: number; notes: string | null;
}
interface Goal {
  id: number; name: string; type: string; targetValue: number;
  targetAsset: string | null; targetUnit: string; deadline: string | null;
  priority: number; completed: boolean; currentValue: number; progress: number;
  notes: string | null; profileId: number;
}
interface DcaPlan {
  id: number; name: string; asset: string; amount: number;
  frequency: string; nextExecution: string | null; enabled: boolean;
  assetClass: string | null;
  autoExecute?: boolean; autoDayOfWeek?: number | null;
  autoStartDate?: string | null; broker?: string | null;
}
interface DcaExecution {
  id: number; planId: number; amount: number; price: number | null;
  units: number | null; date: string; notes: string | null;
}
interface WeekItem {
  label: string; start: string; end: string; target: number;
  executed: number; done: boolean; autoDone?: boolean;
  isCurrent: boolean; isPast: boolean; isFuture: boolean;
}
interface PlanSchedule {
  planId: number; asset: string; name: string;
  isCrypto?: boolean; baseMonthly?: number; appliedMultiplier?: number;
  autoExecute?: boolean; autoDayOfWeek?: number | null; broker?: string | null;
  monthlyTarget: number; weeklyTarget: number;
  totalExecuted: number; remaining: number; onTrack: boolean;
  weeks: WeekItem[];
}
interface ScheduleData {
  currentWeek: number; totalWeeks: number;
  weeklyBudget: number; thisWeekExecuted: number; thisWeekRemaining: number;
  fgValue?: number; fgMultiplier?: number;
  schedule: PlanSchedule[];
}
interface Allocation {
  class: string; current: number; target: number; drift: number;
  currentValue: number; targetValue: number;
}
interface HealthData {
  score: number; allocation: Allocation[];
  actions: { priority: number; icon: string; text: string; amount?: number }[];
  warnings: string[]; goalsProgress: Goal[];
  dcaSummary: { activePlans: number; totalMonthly: number; totalExecutions: number };
  emergency: { target: number; current: number; ok: boolean; surplus: number };
}
interface MarketData {
  fearGreed: { value: number; label: string; timestamp: string | null };
  dcaMultiplier: { value: number; label: string };
  finances: {
    savingsRate: number; monthlyIncome: number; monthlyExpenses: number;
    monthlyInvestable: number; netWorth: number;
  };
}
interface StrategyData {
  profile: StrategyProfile; goals: Goal[];
  plans: DcaPlan[]; executions: DcaExecution[];
}

const CLASS_ICONS: Record<string, string> = {
  cash: "💶", etfs: "📈", crypto: "₿", gold: "🥇", bonds: "🏦", stocks: "📊",
};
const CLASS_LABELS: Record<string, string> = {
  cash: "Cash", etfs: "ETFs", crypto: "Crypto", gold: "Oro", bonds: "Bonos", stocks: "Acciones",
};
const ASSET_EMOJI: Record<string, string> = {
  BTC: "₿", ETH: "Ξ", SOL: "◎", "MSCI World": "🌍", "MSCI Momentum": "⚡",
  "Gold ETC": "🥇", "EU Infl Bond": "🛡️", MSFT: "💻",
};

// ========== MARKET CONTEXT STRIP ==========
function MarketStrip({ market, netWorth }: { market: MarketData | null; netWorth: number }) {
  if (!market) return null;
  const fg = market.fearGreed.value;
  const fgColor = fg <= 24 ? "text-red-400" : fg <= 44 ? "text-orange-400" :
    fg <= 55 ? "text-zinc-300" : fg <= 74 ? "text-emerald-400" : "text-red-400";
  const multColor = market.dcaMultiplier.value >= 1.5 ? "text-emerald-400" :
    market.dcaMultiplier.value >= 1 ? "text-zinc-300" : "text-amber-400";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Miedo / Codicia</div>
        <div className={`text-3xl font-bold ${fgColor}`}>{fg}</div>
        <div className={`text-xs ${fgColor}`}>{market.fearGreed.label}</div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Ritmo sugerido</div>
        <div className={`text-3xl font-bold ${multColor}`}>×{market.dcaMultiplier.value}</div>
        <div className={`text-xs ${multColor}`}>{market.dcaMultiplier.label}</div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Ahorro mensual</div>
        <div className="text-3xl font-bold text-zinc-100">{market.finances.savingsRate}%</div>
        <div className="text-xs text-zinc-400">€{market.finances.monthlyInvestable.toLocaleString("es-ES")}/mes disponible</div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Patrimonio</div>
        <div className="text-3xl font-bold text-zinc-100">€{netWorth.toLocaleString("es-ES")}</div>
        <div className="text-xs text-zinc-400">Portfolio + banco</div>
      </div>
    </div>
  );
}

// ========== WEEKLY SHOPPING LIST (HERO) ==========
function WeeklyShoppingList({
  schedule, plans, onExecute,
}: {
  schedule: ScheduleData | null; plans: DcaPlan[];
  onExecute: (plan: DcaPlan) => void;
}) {
  if (!schedule) return null;

  // Build this-week items from schedule
  const items = schedule.schedule.map(ps => {
    const currentWeek = ps.weeks.find(w => w.isCurrent);
    const plan = plans.find(p => p.id === ps.planId);
    return {
      planId: ps.planId, asset: ps.asset, name: ps.name,
      weeklyTarget: ps.weeklyTarget, executed: currentWeek?.executed || 0,
      done: currentWeek?.done || false,
      autoDone: currentWeek?.autoDone || false,
      monthExecuted: ps.totalExecuted,
      monthTarget: ps.monthlyTarget, baseMonthly: ps.baseMonthly || ps.monthlyTarget,
      multiplier: ps.appliedMultiplier || 1, isCrypto: !!ps.isCrypto,
      autoExecute: !!ps.autoExecute, broker: ps.broker, plan,
    };
  });

  const weekTotal = items.reduce((s, it) => s + it.weeklyTarget, 0);
  const weekDone = items.reduce((s, it) => s + (it.done ? it.weeklyTarget : 0), 0);
  const progressPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
  const remaining = items.filter(it => !it.done).length;

  return (
    <div className="bg-gradient-to-br from-emerald-900/20 via-zinc-900 to-zinc-900 border border-emerald-700/40 rounded-2xl p-5 md:p-6 shadow-lg">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium uppercase tracking-wider mb-1">
            <ShoppingCart className="w-3.5 h-3.5" /> Esta semana
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-zinc-100">
            {remaining === 0 ? (
              <>¡Todo hecho esta semana! <span className="text-emerald-400">✓</span></>
            ) : (
              <>Tienes {remaining} {remaining === 1 ? "compra pendiente" : "compras pendientes"}</>
            )}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Total esta semana: <span className="font-semibold text-zinc-200">€{weekTotal.toFixed(2)}</span>
            {" · "}
            Hechas: <span className="text-emerald-400 font-semibold">€{weekDone.toFixed(2)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl md:text-4xl font-bold text-emerald-400">{progressPct}%</div>
          <div className="text-[10px] text-zinc-500 uppercase">Semana</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-5">
        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%` }} />
      </div>

      {/* Shopping list */}
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.planId}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              it.done
                ? "bg-emerald-500/10 border border-emerald-500/30"
                : it.autoExecute
                  ? "bg-blue-500/5 border border-blue-500/30"
                  : "bg-zinc-800/60 border border-zinc-700/50 hover:border-zinc-600"
            }`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
              it.done ? "bg-emerald-500/20" : "bg-zinc-900"
            }`}>
              {it.done ? <Check className="w-5 h-5 text-emerald-400" /> : (ASSET_EMOJI[it.asset] || "💼")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold ${it.done ? "text-zinc-400 line-through" : "text-zinc-100"}`}>
                  {it.asset}
                </span>
                {it.multiplier > 1 && !it.done && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold">
                    ×{it.multiplier} miedo extremo
                  </span>
                )}
                {it.multiplier < 1 && !it.done && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-semibold">
                    ×{it.multiplier} codicia
                  </span>
                )}
                {it.autoExecute && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full font-medium">
                    🤖 Plan {it.broker || "auto"}
                  </span>
                )}
                <span className="text-xs text-zinc-500">€{it.monthExecuted.toFixed(0)} / €{it.monthTarget.toFixed(0)} este mes</span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">{it.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-lg font-bold ${it.done ? "text-emerald-400" : "text-zinc-100"}`}>
                €{it.weeklyTarget.toFixed(2)}
              </div>
            </div>
            {!it.done && it.plan && (
              <button onClick={() => onExecute(it.plan!)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold shrink-0 shadow-sm transition-colors">
                Comprar
              </button>
            )}
            {it.done && !it.autoDone && (
              <span className="px-3 py-1 text-xs text-emerald-400 font-medium shrink-0">Hecho ✓</span>
            )}
            {it.autoDone && (
              <span className="px-3 py-1 text-xs text-blue-400 font-medium shrink-0">🤖 Hecho auto</span>
            )}
          </div>
        ))}
      </div>

      {/* Guidance footer */}
      <div className="mt-4 pt-4 border-t border-zinc-800 flex items-start gap-2 text-xs text-zinc-500">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          Cada importe ya incluye el multiplicador por miedo/codicia (si lo hay) — solo se aplica a crypto.
          Los ETFs/acciones se compran en Trade Republic con Plan de Ahorro (0€ comisión, decimales OK).
          Si te saltas una semana, se acumula al mes.
        </p>
      </div>
    </div>
  );
}

// ========== MONTH PROGRESS CARD ==========
function MonthProgress({
  schedule, totalMonthly,
}: {
  schedule: ScheduleData | null; totalMonthly: number;
}) {
  if (!schedule) return null;
  const totalExecuted = schedule.schedule.reduce((s, p) => s + p.totalExecuted, 0);
  const pct = totalMonthly > 0 ? Math.min(100, Math.round((totalExecuted / totalMonthly) * 100)) : 0;
  const now = new Date();
  const monthName = now.toLocaleString("es-ES", { month: "long" });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" /> Progreso de {monthName}
        </h3>
        <span className="text-xs text-zinc-500">Semana {schedule.currentWeek} de {schedule.totalWeeks}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-zinc-100">€{totalExecuted.toFixed(0)}</span>
        <span className="text-zinc-500">/ €{totalMonthly}</span>
        <span className="ml-auto text-lg font-semibold text-blue-400">{pct}%</span>
      </div>
      <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 text-xs text-zinc-500">
        {totalMonthly - totalExecuted > 0 ? (
          <>Quedan <span className="text-zinc-300 font-medium">€{(totalMonthly - totalExecuted).toFixed(0)}</span> por invertir este mes</>
        ) : (
          <span className="text-emerald-400">¡Objetivo del mes cubierto!</span>
        )}
      </div>
    </div>
  );
}

// ========== EMERGENCY + CASH DEPLOY CARD ==========
function EmergencyCard({ emergency }: { emergency: HealthData["emergency"] }) {
  const pct = emergency.target > 0 ? Math.min(100, Math.round((emergency.current / emergency.target) * 100)) : 0;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Shield className={`w-4 h-4 ${emergency.ok ? "text-emerald-400" : "text-red-400"}`} />
          Fondo de emergencia
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          emergency.ok ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
        }`}>{emergency.ok ? "OK" : "Insuficiente"}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-zinc-100">€{emergency.current.toLocaleString("es-ES")}</span>
        <span className="text-zinc-500">/ €{emergency.target.toLocaleString("es-ES")}</span>
      </div>
      <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${emergency.ok ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }} />
      </div>
      {emergency.surplus > 0 && (
        <div className="mt-3 text-xs bg-emerald-500/10 text-emerald-400 rounded-lg px-3 py-2">
          💰 Tienes <b>€{emergency.surplus.toLocaleString("es-ES")}</b> de cash extra que puedes invertir.
        </div>
      )}
    </div>
  );
}

// ========== GOALS CARD GRID ==========
function GoalsGrid({
  goals, onComplete, onAdd,
}: {
  goals: Goal[]; onComplete: (id: number) => void; onAdd: () => void;
}) {
  const sorted = [...goals].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.priority - b.priority;
  });
  const priorityLabel = (p: number) => p === 1 ? "Alta" : p === 2 ? "Media" : "Baja";
  const priorityStyle = (p: number) =>
    p === 1 ? "bg-red-500/20 text-red-400" :
    p === 2 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-400";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-purple-400" /> Objetivos
        </h3>
        <button onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium">
          <Plus className="w-3 h-3" /> Nuevo
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map(g => {
          const unit = g.targetUnit === "EUR" ? "€" : "";
          const fmt = (v: number) => g.targetUnit === "EUR" ? `€${Math.round(v).toLocaleString("es-ES")}` :
            g.targetUnit === "units" ? v.toFixed(4) :
            g.targetUnit === "percent" ? `${v}%` : `${v}`;
          const barColor = g.progress >= 75 ? "bg-emerald-500" : g.progress >= 40 ? "bg-amber-500" : "bg-blue-500";
          return (
            <div key={g.id}
              className={`bg-zinc-800/40 border border-zinc-800 rounded-lg p-3 ${g.completed ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm text-zinc-100 truncate">{g.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${priorityStyle(g.priority)}`}>
                      {priorityLabel(g.priority)}
                    </span>
                  </div>
                </div>
                {!g.completed && (
                  <button onClick={() => onComplete(g.id)}
                    className="p-1 hover:bg-emerald-900/30 rounded text-emerald-500 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                <div className={`h-full ${barColor} rounded-full transition-all duration-700`}
                  style={{ width: `${g.progress}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500">
                <span>{fmt(g.currentValue)}</span>
                <span className="text-zinc-400 font-medium">{g.progress}%</span>
                <span>{fmt(g.targetValue)}</span>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="col-span-2 text-center text-xs text-zinc-500 py-6">
            Sin objetivos. Crea uno para empezar.
          </div>
        )}
      </div>
    </div>
  );
}

// ========== ALLOCATION COMPACT ==========
function AllocationCompact({ allocation }: { allocation: Allocation[] }) {
  const { convert } = useCurrency();
  const sorted = [...allocation].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Distribución actual
        </h3>
        <span className="text-[10px] text-zinc-500">Línea = objetivo</span>
      </div>
      <div className="space-y-1.5">
        {sorted.map(item => {
          const absDrift = Math.abs(item.drift);
          const barColor = absDrift > 15 ? "bg-red-500/70" : absDrift > 5 ? "bg-amber-500/70" : "bg-emerald-500/70";
          const driftColor = absDrift > 15 ? "text-red-400" : absDrift > 5 ? "text-amber-400" : "text-emerald-400";
          const max = Math.max(item.current, item.target, 1);
          const barW = (item.current / max) * 100;
          const targetX = (item.target / max) * 100;
          const eur = Math.round(convert(item.currentValue));
          return (
            <div key={item.class} className="flex items-center gap-3">
              <div className="w-20 shrink-0 flex items-center gap-1.5">
                <span>{CLASS_ICONS[item.class]}</span>
                <span className="text-xs text-zinc-300">{CLASS_LABELS[item.class]}</span>
              </div>
              <div className="flex-1 relative h-6 bg-zinc-800 rounded">
                <div className={`h-full ${barColor} rounded transition-all duration-700`} style={{ width: `${barW}%` }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/70" style={{ left: `${targetX}%` }} />
                <div className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                  <span className="text-white/80">{item.current}%</span>
                </div>
              </div>
              <div className="w-20 text-right shrink-0 text-[10px] text-zinc-400">
                €{eur.toLocaleString("es-ES")}
              </div>
              <div className={`w-12 text-right shrink-0 text-[10px] font-mono ${driftColor}`}>
                {item.drift > 0 ? "+" : ""}{item.drift}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== COLLAPSIBLE SECTION ==========
function Collapsible({
  title, defaultOpen = false, children, icon, badge,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
  icon?: React.ReactNode; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/40 transition-colors">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          {icon} {title}
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-normal">
              {badge}
            </span>
          )}
        </h3>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ========== DCA PLANS FULL LIST (collapsible) ==========
function DcaPlansList({
  plans, executions, onExecute, onConfigAuto, monthlyInvest,
}: {
  plans: DcaPlan[]; executions: DcaExecution[];
  onExecute: (plan: DcaPlan) => void;
  onConfigAuto: (plan: DcaPlan) => void;
  monthlyInvest: number;
}) {
  const active = plans.filter(p => p.enabled);
  const paused = plans.filter(p => !p.enabled);
  const total = active.reduce((s, p) => s + p.amount, 0);
  const DOW_LABELS = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-500">
        {active.length} activos · €{total}/mes
        {monthlyInvest > total && (
          <> · <span className="text-amber-400">€{monthlyInvest - total} sin asignar</span></>
        )}
      </div>
      <div className="divide-y divide-zinc-800/60">
        {active.map(p => {
          const execs = executions.filter(e => e.planId === p.id);
          const isAuto = p.autoExecute && p.autoDayOfWeek;
          return (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm shrink-0">
                {ASSET_EMOJI[p.asset] || "💼"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate flex items-center gap-1.5">
                  {p.asset}
                  {isAuto && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full font-medium">
                      🤖 {p.broker || "Auto"} · {DOW_LABELS[p.autoDayOfWeek!]}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500">€{p.amount}/mes · {execs.length} ejecuciones</div>
              </div>
              <button onClick={() => onConfigAuto(p)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg shrink-0"
                title="Configurar plan automático del broker">
                <Zap className="w-4 h-4" />
              </button>
              <button onClick={() => onExecute(p)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-medium shrink-0">
                Comprar
              </button>
            </div>
          );
        })}
      </div>
      {paused.length > 0 && (
        <div className="pt-3 border-t border-zinc-800/60">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Pausados</div>
          {paused.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 opacity-60">
              <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm shrink-0">
                {ASSET_EMOJI[p.asset] || "💼"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-400 truncate">{p.asset}</div>
                <div className="text-[11px] text-zinc-600">€{p.amount}/mes · pausado</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== EXECUTION HISTORY ==========
function HistoryTable({
  executions, plans,
}: {
  executions: DcaExecution[]; plans: DcaPlan[];
}) {
  const sorted = [...executions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  if (sorted.length === 0) return <p className="text-xs text-zinc-500 text-center py-4">Sin historial aún</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 font-normal">Fecha</th>
            <th className="text-left py-2 font-normal">Asset</th>
            <th className="text-right py-2 font-normal">€</th>
            <th className="text-right py-2 font-normal">Unidades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {sorted.map(e => {
            const plan = plans.find(p => p.id === e.planId);
            return (
              <tr key={e.id} className="text-zinc-300">
                <td className="py-2 text-zinc-500">{e.date}</td>
                <td className="py-2">{plan?.asset || "?"}</td>
                <td className="py-2 text-right text-emerald-400">€{e.amount.toFixed(2)}</td>
                <td className="py-2 text-right text-zinc-400">{e.units ? e.units.toFixed(6) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {executions.length > 15 && (
        <div className="text-[10px] text-zinc-500 mt-2 text-center">
          Últimas 15 de {executions.length}
        </div>
      )}
    </div>
  );
}

// ========== EXECUTE MODAL ==========
function ExecuteModal({
  plan, onClose, onSubmit, onSync,
}: {
  plan: DcaPlan; onClose: () => void;
  onSubmit: (data: { planId: number; amount: number; price?: number; units?: number; notes?: string }) => void;
  onSync: () => void;
}) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [amount, setAmount] = useState(plan.amount.toString());
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      onSync();
      onClose();
    } catch (e) { console.error(e); }
    setSyncing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Registrar compra — {plan.asset}</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-1 mb-4 bg-zinc-800 rounded-lg p-0.5">
          <button onClick={() => setMode("auto")}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              mode === "auto" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}>Desde exchange</button>
          <button onClick={() => setMode("manual")}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              mode === "manual" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}>Manual</button>
        </div>
        {mode === "auto" ? (
          <div className="space-y-3">
            <div className="bg-zinc-800/50 rounded-lg p-4 text-center space-y-2">
              <div className="text-sm text-zinc-300">Sincronizar con Binance/exchanges conectadas</div>
              <div className="text-xs text-zinc-500">
                Detecta tus compras de <span className="text-white font-medium">{plan.asset}</span> y las vincula a este plan.
              </div>
            </div>
            <button onClick={handleSync} disabled={syncing}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
              {syncing ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Sincronizando…</> : "🔄 Sync y vincular"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Importe (€)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Precio de compra (opcional)</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Precio por unidad"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Notas (opcional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Compra OTC"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <button onClick={() => onSubmit({
              planId: plan.id, amount: parseFloat(amount),
              price: price ? parseFloat(price) : undefined,
              units: price ? parseFloat(amount) / parseFloat(price) : undefined,
              notes: notes || undefined,
            })} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold">
              Registrar compra
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== AUTO PLAN (SPARPLAN) MODAL ==========
function AutoPlanModal({
  plan, onClose, onSave,
}: {
  plan: DcaPlan; onClose: () => void;
  onSave: (data: { autoExecute: boolean; autoDayOfWeek: number | null; autoStartDate: string | null; broker: string | null }) => void;
}) {
  const [autoExecute, setAutoExecute] = useState(!!plan.autoExecute);
  const [broker, setBroker] = useState<string>(plan.broker || "Trade Republic");
  const [day, setDay] = useState<number>(plan.autoDayOfWeek || 2);
  const [startDate, setStartDate] = useState<string>(plan.autoStartDate || "");
  const DOW_OPTIONS = [
    { v: 1, label: "Lunes" },
    { v: 2, label: "Martes" },
    { v: 3, label: "Miércoles" },
    { v: 4, label: "Jueves" },
    { v: 5, label: "Viernes" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Plan automático — {plan.asset}</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="text-sm text-zinc-400 leading-relaxed">
            Si tienes este activo configurado en <b>Plan de Ahorro (Sparplan)</b> en Trade Republic
            o en un plan recurrente de Binance, actívalo aquí. FinTrack marcará la compra semanal
            como hecha automáticamente el día en que se ejecute, sin que tengas que tocar nada.
          </div>

          <div className="flex items-center gap-3 p-3 bg-zinc-800/40 rounded-lg">
            <input type="checkbox" id="auto-exec" checked={autoExecute}
              onChange={e => setAutoExecute(e.target.checked)}
              className="w-5 h-5 rounded" />
            <label htmlFor="auto-exec" className="text-sm font-medium cursor-pointer">
              Tengo este plan automatizado en mi broker
            </label>
          </div>

          {autoExecute && (
            <>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Broker</label>
                <select value={broker} onChange={e => setBroker(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
                  <option value="Trade Republic">Trade Republic (Sparplan)</option>
                  <option value="Binance">Binance (Plan Auto-Invest)</option>
                  <option value="Revolut">Revolut</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Día de la semana de ejecución</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DOW_OPTIONS.map(o => (
                    <button key={o.v}
                      onClick={() => setDay(o.v)}
                      className={`py-2 px-2 text-xs rounded-lg font-medium transition-colors ${
                        day === o.v
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      }`}>
                      {o.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-zinc-500 mt-2">
                  Recomendado: martes/miércoles (evita lunes/viernes — menor volumen y spreads peores).
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Primera ejecución (opcional)</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
                <div className="text-[10px] text-zinc-500 mt-1">
                  Si tu plan empieza en una fecha futura (p.ej. 4 mayo), ponla aquí. Las semanas anteriores NO se marcan como auto.
                </div>
              </div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs text-zinc-400 leading-relaxed">
                <b className="text-blue-400">Cómo funciona:</b> cada {DOW_OPTIONS.find(o => o.v === day)?.label.toLowerCase()}
                {startDate ? ` desde el ${startDate}` : ""}, el plan semanal aparecerá como
                ✓ hecho automáticamente. No tienes que venir a FinTrack a confirmar. Cuando sincronices la compra real
                (botón Sync en Comprar), se vinculará la transacción.
              </div>
            </>
          )}

          <button onClick={() => onSave({
            autoExecute,
            autoDayOfWeek: autoExecute ? day : null,
            autoStartDate: autoExecute && startDate ? startDate : null,
            broker: autoExecute ? broker : null,
          })} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold">
            Guardar configuración
          </button>
          {plan.autoExecute && (
            <button onClick={() => onSave({ autoExecute: false, autoDayOfWeek: null, autoStartDate: null, broker: null })}
              className="w-full py-2 text-xs text-red-400 hover:text-red-300">
              Desactivar plan automático
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== EDIT PROFILE MODAL ==========
function EditProfileModal({
  profile, onClose, onSave,
}: {
  profile: StrategyProfile; onClose: () => void;
  onSave: (data: Partial<StrategyProfile>) => void;
}) {
  const [form, setForm] = useState({
    targetCash: profile.targetCash, targetEtfs: profile.targetEtfs,
    targetCrypto: profile.targetCrypto, targetGold: profile.targetGold,
    targetBonds: profile.targetBonds, targetStocks: profile.targetStocks,
    monthlyInvest: profile.monthlyInvest, emergencyMonths: profile.emergencyMonths,
    riskProfile: profile.riskProfile,
  });
  const total = form.targetCash + form.targetEtfs + form.targetCrypto + form.targetGold + form.targetBonds + form.targetStocks;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Editar estrategia</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Perfil de riesgo</label>
            <select value={form.riskProfile} onChange={e => setForm({ ...form, riskProfile: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
              <option value="conservative">Conservador</option>
              <option value="balanced">Equilibrado</option>
              <option value="growth">Crecimiento</option>
              <option value="aggressive">Agresivo</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["Cash", "ETFs", "Crypto", "Gold", "Bonds", "Stocks"] as const).map(label => {
              const key = `target${label}` as keyof typeof form;
              return (
                <div key={label}>
                  <label className="text-xs text-zinc-400 mb-1 block">{CLASS_ICONS[label.toLowerCase()] || ""} {label} (%)</label>
                  <input type="number" value={form[key]} onChange={e => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
                </div>
              );
            })}
          </div>
          <div className={`text-xs text-center py-1 rounded ${Math.abs(total - 100) < 0.1 ? "text-emerald-400" : "text-red-400"}`}>
            Total: {total.toFixed(0)}% {Math.abs(total - 100) < 0.1 ? "✓" : "(debe sumar 100%)"}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">DCA mensual (€)</label>
              <input type="number" value={form.monthlyInvest} onChange={e => setForm({ ...form, monthlyInvest: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Meses emergencia</label>
              <input type="number" value={form.emergencyMonths} onChange={e => setForm({ ...form, emergencyMonths: parseInt(e.target.value) || 3 })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
          <button disabled={Math.abs(total - 100) > 0.1} onClick={() => onSave({ id: profile.id, ...form })}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold">
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== ADD GOAL MODAL ==========
function AddGoalModal({
  profileId, onClose, onSave,
}: {
  profileId: number; onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    name: "", type: "custom" as string, targetValue: "",
    targetAsset: "", targetUnit: "EUR", deadline: "", priority: 2,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Nuevo objetivo</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input placeholder="Nombre del objetivo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
            <option value="net_worth">Patrimonio</option>
            <option value="asset_target">Acumular asset</option>
            <option value="savings_rate">Savings rate</option>
            <option value="emergency_fund">Fondo emergencia</option>
            <option value="custom">Personalizado</option>
          </select>
          {form.type === "asset_target" && (
            <input placeholder="Asset (BTC, MSCI World...)" value={form.targetAsset}
              onChange={e => setForm({ ...form, targetAsset: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Valor objetivo" value={form.targetValue}
              onChange={e => setForm({ ...form, targetValue: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            <select value={form.targetUnit} onChange={e => setForm({ ...form, targetUnit: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="units">Unidades</option>
              <option value="percent">%</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
            <select value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
              <option value={1}>Alta</option>
              <option value={2}>Media</option>
              <option value={3}>Baja</option>
            </select>
          </div>
          <button disabled={!form.name || !form.targetValue} onClick={() => onSave({
            profileId, name: form.name, type: form.type,
            targetValue: parseFloat(form.targetValue), targetAsset: form.targetAsset || null,
            targetUnit: form.targetUnit, deadline: form.deadline || null, priority: form.priority,
          })} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg text-sm font-semibold">
            Crear objetivo
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== MAIN PAGE ==========
export default function StrategyPage() {
  const [strategy, setStrategy] = useState<StrategyData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [executingPlan, setExecutingPlan] = useState<DcaPlan | null>(null);
  const [configAutoPlan, setConfigAutoPlan] = useState<DcaPlan | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [stratRes, healthRes, schedRes, marketRes] = await Promise.all([
        fetch("/api/strategy"),
        fetch("/api/strategy/health"),
        fetch("/api/strategy/schedule"),
        fetch("/api/strategy/market"),
      ]);
      setStrategy(await stratRes.json());
      setHealth(await healthRes.json());
      setSchedule(await schedRes.json());
      setMarket(await marketRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaveProfile = async (data: Partial<StrategyProfile>) => {
    await fetch("/api/strategy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowEditProfile(false);
    fetchAll();
  };

  const handleAddGoal = async (data: Record<string, unknown>) => {
    await fetch("/api/strategy/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowAddGoal(false);
    fetchAll();
  };

  const handleCompleteGoal = async (id: number) => {
    await fetch("/api/strategy/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completed: true }),
    });
    fetchAll();
  };

  const handleExecuteDCA = async (data: { planId: number; amount: number; price?: number; units?: number; notes?: string }) => {
    await fetch("/api/strategy/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setExecutingPlan(null);
    fetchAll();
  };

  const handleSaveAutoPlan = async (data: { autoExecute: boolean; autoDayOfWeek: number | null; autoStartDate: string | null; broker: string | null }) => {
    if (!configAutoPlan) return;
    await fetch("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: configAutoPlan.id, ...data }),
    });
    setConfigAutoPlan(null);
    fetchAll();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
    </div>
  );
  if (!strategy || !health) return <div className="text-red-400">Error cargando estrategia</div>;

  const { profile, plans, executions, goals } = strategy;
  const { allocation, warnings, dcaSummary, emergency } = health;
  const goalsWithProgress = health.goalsProgress;

  return (
    <div className="space-y-5">
      {/* ====== HEADER ====== */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Target className="w-7 h-7 text-emerald-500" />
            {profile.name}
          </h1>
          {warnings.length > 0 && (
            <div className="flex items-center gap-1 mt-1 text-xs text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {warnings[0]}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/strategy/guide"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-sm font-medium border border-emerald-500/30">
            <BookOpen className="w-4 h-4" /> Aprender mi estrategia
          </Link>
          <button onClick={() => setShowEditProfile(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium border border-zinc-700">
            <Edit3 className="w-4 h-4" /> Editar objetivos
          </button>
        </div>
      </div>

      {/* ====== MARKET STRIP ====== */}
      <MarketStrip market={market} netWorth={market?.finances.netWorth || 0} />

      {/* ====== WEEKLY SHOPPING LIST (HERO) ====== */}
      <WeeklyShoppingList schedule={schedule} plans={plans} onExecute={setExecutingPlan} />

      {/* ====== SECONDARY GRID: MONTH PROGRESS + EMERGENCY ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthProgress schedule={schedule} totalMonthly={dcaSummary.totalMonthly} />
        <EmergencyCard emergency={emergency} />
      </div>

      {/* ====== GOALS + ALLOCATION ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GoalsGrid goals={goalsWithProgress} onComplete={handleCompleteGoal} onAdd={() => setShowAddGoal(true)} />
        <AllocationCompact allocation={allocation} />
      </div>

      {/* ====== COLLAPSIBLE: DCA PLANS ====== */}
      <Collapsible
        title="Planes DCA"
        icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
        badge={`${dcaSummary.activePlans} activos · €${dcaSummary.totalMonthly}/mes`}>
        <DcaPlansList plans={plans} executions={executions}
          onExecute={setExecutingPlan}
          onConfigAuto={setConfigAutoPlan}
          monthlyInvest={profile.monthlyInvest} />
      </Collapsible>

      {/* ====== COLLAPSIBLE: HISTORY ====== */}
      <Collapsible
        title="Historial de compras"
        icon={<Clock className="w-4 h-4 text-zinc-500" />}
        badge={`${executions.length} ejecuciones`}>
        <HistoryTable executions={executions} plans={plans} />
      </Collapsible>

      {/* ====== NOTES (if any) ====== */}
      {profile.notes && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Notas del plan
          </div>
          {profile.notes}
        </div>
      )}

      {/* Modals */}
      {showEditProfile && <EditProfileModal profile={profile} onClose={() => setShowEditProfile(false)} onSave={handleSaveProfile} />}
      {showAddGoal && <AddGoalModal profileId={profile.id} onClose={() => setShowAddGoal(false)} onSave={handleAddGoal} />}
      {executingPlan && <ExecuteModal plan={executingPlan} onClose={() => setExecutingPlan(null)} onSubmit={handleExecuteDCA} onSync={fetchAll} />}
      {configAutoPlan && <AutoPlanModal plan={configAutoPlan} onClose={() => setConfigAutoPlan(null)} onSave={handleSaveAutoPlan} />}
    </div>
  );
}
