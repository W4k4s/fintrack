"use client";
import { usePrivacy } from "@/components/privacy-provider";
import type { DcaExecution, DcaPlan } from "./types";

export function HistoryTable({
  executions, plans,
}: {
  executions: DcaExecution[]; plans: DcaPlan[];
}) {
  const { mask } = usePrivacy();
  const sorted = [...executions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  if (sorted.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Sin historial aún</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-2 font-normal">Fecha</th>
            <th className="text-left py-2 font-normal">Asset</th>
            <th className="text-right py-2 font-normal">€</th>
            <th className="text-right py-2 font-normal">Unidades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map(e => {
            const plan = plans.find(p => p.id === e.planId);
            return (
              <tr key={e.id} className="text-foreground">
                <td className="py-2 text-muted-foreground tabular-nums">{e.date}</td>
                <td className="py-2">{plan?.asset || "?"}</td>
                <td className="py-2 text-right text-success tabular-nums">{mask(`€${e.amount.toFixed(2)}`)}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">{e.units ? e.units.toFixed(6) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {executions.length > 15 && (
        <div className="text-[10px] text-muted-foreground mt-2 text-center">
          Últimas 15 de {executions.length}
        </div>
      )}
    </div>
  );
}
