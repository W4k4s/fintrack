"use client";

import { PiggyBank, Plus, CheckCircle2, RotateCcw } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import { cn } from "@/lib/utils";

export interface Goal {
  id: number;
  name: string;
  type: string;
  targetValue: number;
  targetAsset: string | null;
  targetUnit: string;
  deadline: string | null;
  priority: number;
  completed: boolean;
  currentValue: number;
  progress: number;
  notes: string | null;
  profileId: number;
}

const PRIORITY_LABEL: Record<number, string> = { 1: "Alta", 2: "Media", 3: "Baja" };

function formatValue(v: number, unit: string, mask: (s: string) => string): string {
  // EUR and raw unit counts are sensitive (they reveal portfolio size);
  // percentages are left visible since they're indicators, not amounts.
  if (unit === "EUR") return mask(`€${Math.round(v).toLocaleString("es-ES")}`);
  if (unit === "units") return mask(v.toFixed(4));
  if (unit === "percent") return `${v}%`;
  return `${v}`;
}

function progressColor(pct: number): string {
  if (pct >= 75) return "bg-success";
  if (pct >= 40) return "bg-warn";
  return "bg-info";
}

function GoalRow({ g, onToggle }: { g: Goal; onToggle: (id: number, completed: boolean) => void }) {
  const { mask } = usePrivacy();
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors",
        "hover:bg-[var(--hover-bg)]",
        g.completed && "opacity-60",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-medium text-foreground truncate">{g.name}</span>
          {g.completed && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success-soft text-success uppercase tracking-wider">
              done
            </span>
          )}
        </div>
        <div className="h-1 bg-elevated rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", progressColor(g.progress))}
            style={{ width: `${Math.min(100, g.progress)}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1 text-[10px] font-mono tabular-nums text-muted-foreground">
          <span>{formatValue(g.currentValue, g.targetUnit, mask)}</span>
          <span className="text-foreground">{g.progress}%</span>
          <span>{formatValue(g.targetValue, g.targetUnit, mask)}</span>
        </div>
      </div>
      <button
        onClick={() => onToggle(g.id, !g.completed)}
        aria-label={g.completed ? "Reabrir objetivo" : "Marcar completado"}
        title={g.completed ? "Reabrir objetivo" : "Marcar completado"}
        className={cn(
          "p-1.5 rounded-md transition-colors shrink-0",
          g.completed
            ? "text-success hover:bg-warn-soft hover:text-warn"
            : "text-muted-foreground hover:bg-success-soft hover:text-success",
        )}
      >
        {g.completed ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function GoalsStack({
  goals,
  onToggle,
  onAdd,
}: {
  goals: Goal[];
  onToggle: (id: number, completed: boolean) => void;
  onAdd: () => void;
}) {
  const active = goals.filter(g => !g.completed).sort((a, b) => a.priority - b.priority);
  const done = goals.filter(g => g.completed).sort((a, b) => a.priority - b.priority);

  const grouped = [1, 2, 3].map(p => ({
    priority: p,
    label: PRIORITY_LABEL[p],
    items: active.filter(g => g.priority === p),
  })).filter(g => g.items.length > 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-info" /> Objetivos
          {active.length > 0 && (
            <span className="text-xs font-mono text-muted-foreground">
              {active.length}
            </span>
          )}
        </h3>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-elevated hover:bg-[var(--hover-bg)] border border-border rounded-md text-xs font-medium transition-colors"
        >
          <Plus className="w-3 h-3" /> Nuevo
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          Sin objetivos. Crea uno para empezar.
        </div>
      ) : (
        <div className="-mx-2">
          {grouped.map((group) => (
            <div key={group.priority} className="mb-2 last:mb-0">
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                {group.label} <span className="opacity-60">· {group.items.length}</span>
              </div>
              <div>
                {group.items.map((g) => (
                  <GoalRow key={g.id} g={g} onToggle={onToggle} />
                ))}
              </div>
            </div>
          ))}

          {done.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="px-3 pb-1.5 text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                Completados <span className="opacity-60">· {done.length}</span>
              </div>
              {done.map((g) => (
                <GoalRow key={g.id} g={g} onToggle={onToggle} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
