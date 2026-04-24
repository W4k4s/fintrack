"use client";
import { Activity } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import type { ScheduleData } from "./types";

// Progreso del mes alineado con WeeklyShoppingList: sólo items activos
// (sin pauseReason) y usando monthlyTarget (multiplicador aplicado).
// Antes el total venía de dcaSummary.totalMonthly (baseMonthly de TODOS
// los planes, pausados incluidos) y el ejecutado sumaba TODO → dos
// componentes en la misma página mostraban porcentajes distintos.
export function MonthProgress({
  schedule,
}: {
  schedule: ScheduleData | null;
}) {
  const { mask } = usePrivacy();
  if (!schedule) return null;
  // Filtra solo pauses per-plan (crypto_paused, asset_not_in_scope) pero
  // mantiene los pauses por fondo incompleto — ésos aplican a todo, y si
  // los excluyéramos quedaría el mes en 0/0 aunque el user haya invertido.
  // El banner de survival ya avisa que está pausado; este card enseña lo
  // que se llegó a ejecutar antes del gate.
  const countableItems = schedule.schedule.filter(
    p => p.pauseReason === null || p.pauseReason === "emergency_fund_incomplete",
  );
  const totalMonthly = countableItems.reduce((s, p) => s + p.monthlyTarget, 0);
  // Capar el "hecho" de cada plan a su target: un plan que sobra-compra no
  // compensa a otro que está corto. Sin esto, EU Infl Bond 175/160 sumaba
  // los 175 y "tapaba" los €15 faltantes de Gold ETC → 100% falso.
  const totalExecuted = countableItems.reduce(
    (s, p) => s + Math.min(p.totalExecuted, p.monthlyTarget),
    0,
  );
  const pct = totalMonthly > 0 ? Math.min(100, Math.round((totalExecuted / totalMonthly) * 100)) : 0;
  const now = new Date();
  const monthName = now.toLocaleString("es-ES", { month: "long" });

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-4 h-4 text-info" /> Progreso de {monthName}
        </h3>
        <span className="text-xs text-muted-foreground">Semana {schedule.currentWeek} de {schedule.totalWeeks}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold tabular-nums text-foreground">{mask(`€${totalExecuted.toFixed(0)}`)}</span>
        <span className="text-muted-foreground tabular-nums">/ {mask(`€${totalMonthly.toFixed(0)}`)}</span>
        <span className="ml-auto text-lg font-semibold tabular-nums text-info">{pct}%</span>
      </div>
      <div className="h-2.5 bg-elevated rounded-full overflow-hidden">
        <div className="h-full bg-info rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {totalMonthly - totalExecuted > 0 ? (
          <>Quedan <span className="text-foreground font-medium tabular-nums">{mask(`€${(totalMonthly - totalExecuted).toFixed(0)}`)}</span> por invertir este mes</>
        ) : (
          <span className="text-success">¡Objetivo del mes cubierto!</span>
        )}
      </div>
    </div>
  );
}
