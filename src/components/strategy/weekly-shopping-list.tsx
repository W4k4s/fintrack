"use client";
import { Check, Info, ShoppingCart } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import { ASSET_EMOJI, type DcaPlan, type ScheduleData } from "./types";

export function WeeklyShoppingList({
  schedule, plans, onExecute,
}: {
  schedule: ScheduleData | null; plans: DcaPlan[];
  onExecute: (plan: DcaPlan) => void;
}) {
  const { mask } = usePrivacy();
  if (!schedule) return null;

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
    <div className="bg-gradient-to-br from-success-soft via-card to-card border border-success/30 rounded-2xl p-5 md:p-6 shadow-lg">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-success font-medium uppercase tracking-wider mb-1">
            <ShoppingCart className="w-3.5 h-3.5" /> Esta semana
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">
            {remaining === 0 ? (
              <>¡Todo hecho esta semana! <span className="text-success">✓</span></>
            ) : (
              <>Tienes {remaining} {remaining === 1 ? "compra pendiente" : "compras pendientes"}</>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Total esta semana: <span className="font-semibold text-foreground tabular-nums">{mask(`€${weekTotal.toFixed(2)}`)}</span>
            {" · "}
            Hechas: <span className="text-success font-semibold tabular-nums">{mask(`€${weekDone.toFixed(2)}`)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl md:text-4xl font-bold tabular-nums text-success">{progressPct}%</div>
          <div className="text-[10px] text-muted-foreground uppercase">Semana</div>
        </div>
      </div>

      <div className="h-2 bg-elevated rounded-full overflow-hidden mb-5">
        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%` }} />
      </div>

      <div className="space-y-2">
        {items.map(it => (
          <div key={it.planId}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              it.done
                ? "bg-success-soft border border-success/30"
                : it.autoExecute
                  ? "bg-info-soft border border-info/30"
                  : "bg-elevated border border-border-strong hover:border-border-strong"
            }`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
              it.done ? "bg-success-soft" : "bg-card"
            }`}>
              {it.done ? <Check className="w-5 h-5 text-success" /> : (ASSET_EMOJI[it.asset] || "💼")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold ${it.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {it.asset}
                </span>
                {it.multiplier > 1 && !it.done && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-success-soft text-success rounded-full font-semibold">
                    ×{it.multiplier} miedo extremo
                  </span>
                )}
                {it.multiplier < 1 && !it.done && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-warn-soft text-warn rounded-full font-semibold">
                    ×{it.multiplier} codicia
                  </span>
                )}
                {it.autoExecute && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-info-soft text-info rounded-full font-medium">
                    🤖 Plan {it.broker || "auto"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">{mask(`€${it.monthExecuted.toFixed(0)}`)} / {mask(`€${it.monthTarget.toFixed(0)}`)} este mes</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{it.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-lg font-bold tabular-nums ${it.done ? "text-success" : "text-foreground"}`}>
                {mask(`€${it.weeklyTarget.toFixed(2)}`)}
              </div>
            </div>
            {!it.done && it.plan && (
              <button onClick={() => onExecute(it.plan!)}
                className="px-4 py-2 bg-success hover:opacity-90 rounded-lg text-sm font-semibold text-success-foreground shrink-0 shadow-sm transition-opacity">
                Comprar
              </button>
            )}
            {it.done && !it.autoDone && (
              <span className="px-3 py-1 text-xs text-success font-medium shrink-0">Hecho ✓</span>
            )}
            {it.autoDone && (
              <span className="px-3 py-1 text-xs text-info font-medium shrink-0">🤖 Hecho auto</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-start gap-2 text-xs text-muted-foreground">
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
