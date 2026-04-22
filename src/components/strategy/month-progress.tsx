"use client";
import { Activity } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import type { ScheduleData } from "./types";

export function MonthProgress({
  schedule, totalMonthly,
}: {
  schedule: ScheduleData | null; totalMonthly: number;
}) {
  const { mask } = usePrivacy();
  if (!schedule) return null;
  const totalExecuted = schedule.schedule.reduce((s, p) => s + p.totalExecuted, 0);
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
        <span className="text-muted-foreground tabular-nums">/ {mask(`€${totalMonthly}`)}</span>
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
