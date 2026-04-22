"use client";
import { Zap } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import { ASSET_EMOJI, type DcaExecution, type DcaPlan } from "./types";

export function DcaPlansList({
  plans, executions, onExecute, onConfigAuto, monthlyInvest,
}: {
  plans: DcaPlan[]; executions: DcaExecution[];
  onExecute: (plan: DcaPlan) => void;
  onConfigAuto: (plan: DcaPlan) => void;
  monthlyInvest: number;
}) {
  const { mask } = usePrivacy();
  const active = plans.filter(p => p.enabled);
  const paused = plans.filter(p => !p.enabled);
  const total = active.reduce((s, p) => s + p.amount, 0);
  const DOW_LABELS = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {active.length} activos · <span className="tabular-nums">{mask(`€${total}`)}</span>/mes
        {monthlyInvest > total && (
          <> · <span className="text-warn tabular-nums">{mask(`€${monthlyInvest - total}`)} sin asignar</span></>
        )}
      </div>
      <div className="divide-y divide-border">
        {active.map(p => {
          const execs = executions.filter(e => e.planId === p.id);
          const isAuto = p.autoExecute && p.autoDayOfWeek;
          return (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-sm shrink-0">
                {ASSET_EMOJI[p.asset] || "💼"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                  {p.asset}
                  {isAuto && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-info-soft text-info rounded-full font-medium">
                      🤖 {p.broker || "Auto"} · {DOW_LABELS[p.autoDayOfWeek!]}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{mask(`€${p.amount}`)}/mes · {execs.length} ejecuciones</div>
              </div>
              <button onClick={() => onConfigAuto(p)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-elevated rounded-lg shrink-0"
                title="Configurar plan automático del broker">
                <Zap className="w-4 h-4" />
              </button>
              <button onClick={() => onExecute(p)}
                className="px-3 py-1.5 bg-success hover:opacity-90 rounded-lg text-xs font-medium shrink-0">
                Comprar
              </button>
            </div>
          );
        })}
      </div>
      {paused.length > 0 && (
        <div className="pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Pausados</div>
          {paused.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 opacity-60">
              <span className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-sm shrink-0">
                {ASSET_EMOJI[p.asset] || "💼"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-muted-foreground truncate">{p.asset}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{mask(`€${p.amount}`)}/mes · pausado</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
