"use client";
import { useState } from "react";
import { Calendar, Check, ChevronDown, ChevronUp } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import { ASSET_EMOJI, type DcaPlan, type PlanSchedule, type ScheduleData, type WeekItem } from "./types";

export function WeeklySchedule({
  schedule, plans, onExecute,
}: {
  schedule: ScheduleData | null; plans: DcaPlan[];
  onExecute: (plan: DcaPlan) => void;
}) {
  if (!schedule || schedule.schedule.length === 0) return null;
  const weekLabels = schedule.schedule[0].weeks.map(w => w.label);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 md:p-5 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4 text-info" />
          Plan del mes completo
          <span className="text-[10px] px-1.5 py-0.5 bg-elevated text-muted-foreground rounded-full font-normal">
            {schedule.totalWeeks} semanas
          </span>
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Timeline semanal por clase — pasado · actual · futuro. El multiplicador (miedo/codicia) solo aplica a crypto.
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-2.5 px-4 font-normal text-muted-foreground sticky left-0 bg-card z-10">Activo</th>
              {weekLabels.map((lbl, i) => {
                const weekData = schedule.schedule[0].weeks[i];
                return (
                  <th key={lbl} className={`text-center py-2.5 px-3 font-normal ${
                    weekData.isCurrent ? "text-info" : "text-muted-foreground"
                  }`}>
                    <div className="font-semibold">{lbl}</div>
                    <div className="text-[10px] opacity-70 tabular-nums">{fmtDay(weekData.start)}</div>
                  </th>
                );
              })}
              <th className="text-right py-2.5 px-4 font-normal text-muted-foreground">Mes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.schedule.map(ps => (
              <PlanRow key={ps.planId} ps={ps} plans={plans} onExecute={onExecute} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-border">
        {weekLabels.map((lbl, i) => {
          const weekData = schedule.schedule[0].weeks[i];
          return (
            <WeekAccordion
              key={lbl}
              label={lbl}
              weekData={weekData}
              defaultOpen={weekData.isCurrent}
              rows={schedule.schedule.map(ps => ({ ps, week: ps.weeks[i] }))}
              plans={plans}
              onExecute={onExecute}
            />
          );
        })}
      </div>
    </div>
  );
}

function PlanRow({
  ps, plans, onExecute,
}: {
  ps: PlanSchedule; plans: DcaPlan[];
  onExecute: (plan: DcaPlan) => void;
}) {
  const { mask } = usePrivacy();
  const plan = plans.find(p => p.id === ps.planId);
  const mult = ps.appliedMultiplier || 1;
  return (
    <tr className="hover:bg-elevated/40 transition-colors">
      <td className="py-3 px-4 sticky left-0 bg-card">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-elevated flex items-center justify-center text-sm shrink-0">
            {ASSET_EMOJI[ps.asset] || "💼"}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
              {ps.asset}
              {mult > 1 && (
                <span className="text-[9px] px-1.5 py-0.5 bg-success-soft text-success rounded-full font-semibold tabular-nums">×{mult}</span>
              )}
              {mult < 1 && (
                <span className="text-[9px] px-1.5 py-0.5 bg-warn-soft text-warn rounded-full font-semibold tabular-nums">×{mult}</span>
              )}
              {ps.autoExecute && (
                <span className="text-[9px] px-1.5 py-0.5 bg-info-soft text-info rounded-full font-medium">🤖</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{ps.name}</div>
          </div>
        </div>
      </td>
      {ps.weeks.map((w, i) => (
        <td key={i} className="py-3 px-3 text-center">
          <WeekCell week={w} plan={plan} onExecute={onExecute} />
        </td>
      ))}
      <td className="py-3 px-4 text-right">
        <div className="text-sm font-semibold tabular-nums text-foreground">{mask(`€${ps.totalExecuted.toFixed(0)}`)}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">/ {mask(`€${ps.monthlyTarget.toFixed(0)}`)}</div>
      </td>
    </tr>
  );
}

function WeekCell({
  week, plan, onExecute,
}: {
  week: WeekItem; plan?: DcaPlan;
  onExecute: (plan: DcaPlan) => void;
}) {
  const { mask } = usePrivacy();
  if (week.isPast) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium tabular-nums ${
        week.done ? "bg-success-soft text-success" : "bg-muted text-muted-foreground line-through"
      }`}>
        {week.done ? <Check className="w-3 h-3" /> : null}
        {mask(`€${week.target.toFixed(0)}`)}
      </div>
    );
  }
  if (week.isCurrent) {
    if (week.done) {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold tabular-nums bg-success text-success-foreground ring-2 ring-success/30">
          <Check className="w-3 h-3" />
          {mask(`€${week.target.toFixed(0)}`)}
        </div>
      );
    }
    return (
      <button
        onClick={() => plan && onExecute(plan)}
        disabled={!plan}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold tabular-nums bg-success-soft text-success border border-success/50 hover:bg-success hover:text-success-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Comprar ahora"
      >
        {mask(`€${week.target.toFixed(0)}`)}
      </button>
    );
  }
  return (
    <div className="inline-flex items-center px-2 py-1 rounded-md text-[11px] tabular-nums bg-muted/40 text-muted-foreground">
      {mask(`€${week.target.toFixed(0)}`)}
    </div>
  );
}

function WeekAccordion({
  label, weekData, defaultOpen, rows, plans, onExecute,
}: {
  label: string; weekData: WeekItem; defaultOpen: boolean;
  rows: { ps: PlanSchedule; week: WeekItem }[];
  plans: DcaPlan[];
  onExecute: (plan: DcaPlan) => void;
}) {
  const { mask } = usePrivacy();
  const [open, setOpen] = useState(defaultOpen);
  const total = rows.reduce((s, r) => s + r.week.target, 0);
  const done = rows.reduce((s, r) => s + (r.week.done ? r.week.target : 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isPast = weekData.isPast;
  const isCurrent = weekData.isCurrent;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-elevated transition-colors ${
          isCurrent ? "bg-info-soft/40" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${
            isCurrent ? "text-info" : isPast ? "text-muted-foreground" : "text-foreground"
          }`}>{label}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDay(weekData.start)}</span>
          {isCurrent && (
            <span className="text-[9px] px-1.5 py-0.5 bg-info text-info-foreground rounded-full font-semibold uppercase">Hoy</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-foreground">{mask(`€${done.toFixed(0)}`)} / {mask(`€${total.toFixed(0)}`)}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
            pct === 100 ? "bg-success-soft text-success" : "bg-elevated text-muted-foreground"
          }`}>{pct}%</span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5">
          {rows.map(r => {
            const plan = plans.find(p => p.id === r.ps.planId);
            const mult = r.ps.appliedMultiplier || 1;
            return (
              <div key={r.ps.planId} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="w-6 h-6 rounded bg-elevated flex items-center justify-center text-[12px] shrink-0">
                  {ASSET_EMOJI[r.ps.asset] || "💼"}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{r.ps.asset}</span>
                  {mult !== 1 && (
                    <span className={`ml-1 text-[9px] px-1 py-0.5 rounded-full tabular-nums ${
                      mult > 1 ? "bg-success-soft text-success" : "bg-warn-soft text-warn"
                    }`}>×{mult}</span>
                  )}
                </div>
                {r.week.done ? (
                  <span className="text-success flex items-center gap-1 tabular-nums">
                    <Check className="w-3 h-3" /> {mask(`€${r.week.target.toFixed(0)}`)}
                  </span>
                ) : r.week.isCurrent && plan ? (
                  <button
                    onClick={() => onExecute(plan)}
                    className="px-2 py-0.5 bg-success-soft text-success rounded border border-success/40 font-semibold tabular-nums"
                  >
                    {mask(`€${r.week.target.toFixed(0)}`)}
                  </button>
                ) : (
                  <span className={`tabular-nums ${r.week.isPast ? "text-muted-foreground line-through" : "text-muted-foreground"}`}>
                    {mask(`€${r.week.target.toFixed(0)}`)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtDay(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch {
    return isoDate;
  }
}
