"use client";
import { Check, Info, ShoppingCart } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import { ASSET_EMOJI, type DcaPlan, type ScheduleData } from "./types";

// Todas las derivaciones (autoPending, displayAmount, done, pauseReason,
// actionLabel) vienen del payload ya resueltas por buildSchedule.
// Este componente es ahora puro renderizado.

export function WeeklyShoppingList({
  schedule, plans, onExecute,
}: {
  schedule: ScheduleData | null; plans: DcaPlan[];
  onExecute: (plan: DcaPlan) => void;
}) {
  const { mask } = usePrivacy();
  if (!schedule) return null;

  const items = schedule.schedule.map(ps => ({
    ...ps,
    plan: plans.find(p => p.id === ps.planId) ?? null,
    currentWeek: ps.weeks.find(w => w.isCurrent),
  }));

  const activeItems = items.filter(it => !it.pauseReason);
  const pausedItems = items.filter(it => !!it.pauseReason);
  const anyAutoPending = activeItems.some(it => it.autoPending);
  const weekTotal = activeItems.reduce((s, it) => s + it.displayAmount, 0);
  const weekDone = activeItems.reduce((s, it) => s + (it.done ? it.displayAmount : 0), 0);
  const progressPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
  const remainingCount = activeItems.filter(it => !it.done).length;

  return (
    <div className="bg-gradient-to-br from-success-soft via-card to-card border border-success/30 rounded-2xl p-5 md:p-6 shadow-lg">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-success font-medium uppercase tracking-wider mb-1">
            <ShoppingCart className="w-3.5 h-3.5" /> {anyAutoPending ? "Pendiente este mes" : "Esta semana"}
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">
            {remainingCount === 0 ? (
              <>¡Todo hecho este mes! <span className="text-success">✓</span></>
            ) : (
              <>Tienes {remainingCount} {remainingCount === 1 ? "compra pendiente" : "compras pendientes"}</>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {anyAutoPending ? "Total pendiente" : "Total esta semana"}: <span className="font-semibold text-foreground tabular-nums">{mask(`€${weekTotal.toFixed(2)}`)}</span>
            {" · "}
            Hechas: <span className="text-success font-semibold tabular-nums">{mask(`€${weekDone.toFixed(2)}`)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl md:text-4xl font-bold tabular-nums text-success">{progressPct}%</div>
          <div className="text-[10px] text-muted-foreground uppercase">{anyAutoPending ? "Mes" : "Semana"}</div>
        </div>
      </div>

      <div className="h-2 bg-elevated rounded-full overflow-hidden mb-5">
        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%` }} />
      </div>

      <div className="space-y-2">
        {activeItems.map(it => (
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
                {!it.done && it.appliedMultiplier > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-success-soft text-success rounded-full font-semibold">
                    ×{it.appliedMultiplier} miedo extremo
                  </span>
                )}
                {!it.done && it.appliedMultiplier < 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-warn-soft text-warn rounded-full font-semibold">
                    ×{it.appliedMultiplier} codicia
                  </span>
                )}
                {it.autoExecute && !it.autoPending && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-info-soft text-info rounded-full font-medium">
                    🤖 Plan {it.broker || "auto"}
                  </span>
                )}
                {it.autoPending && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-warn-soft text-warn rounded-full font-medium">
                    Manual hasta {it.autoStartDate?.slice(5) /* MM-DD */}
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">{mask(`€${it.totalExecuted.toFixed(0)}`)} / {mask(`€${it.monthlyTarget.toFixed(0)}`)} este mes</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{it.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-lg font-bold tabular-nums ${it.done ? "text-success" : "text-foreground"}`}>
                {mask(`€${it.displayAmount.toFixed(2)}`)}
              </div>
              {it.autoPending && !it.done && (
                <div className="text-[10px] text-muted-foreground mt-0.5">resto del mes</div>
              )}
            </div>
            {!it.done && it.plan && (
              <button onClick={() => onExecute(it.plan!)}
                className="px-4 py-2 bg-success hover:opacity-90 rounded-lg text-sm font-semibold text-success-foreground shrink-0 shadow-sm transition-opacity">
                Comprar
              </button>
            )}
            {it.done && !it.currentWeek?.autoDone && (
              <span className="px-3 py-1 text-xs text-success font-medium shrink-0">Hecho ✓</span>
            )}
            {it.currentWeek?.autoDone && (
              <span className="px-3 py-1 text-xs text-info font-medium shrink-0">🤖 Hecho auto</span>
            )}
          </div>
        ))}
      </div>

      {pausedItems.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">
            Pausados ({pausedItems.length})
          </div>
          <div className="space-y-1.5">
            {pausedItems.map(it => (
              <div key={it.planId}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-elevated/40 border border-border/50 opacity-60">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 bg-card grayscale">
                  {ASSET_EMOJI[it.asset] || "💼"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-muted-foreground text-sm">{it.asset}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-warn-soft/60 text-warn/80 rounded-full font-medium">
                      {it.actionLabel}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {mask(`€${it.totalExecuted.toFixed(0)}`)} / {mask(`€${it.monthlyTarget.toFixed(0)}`)} este mes
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/80 mt-0.5">{it.name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium tabular-nums text-muted-foreground">
                    {mask(`€${it.weeklyTarget.toFixed(2)}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
