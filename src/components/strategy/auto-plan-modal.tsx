"use client";
import { useState } from "react";
import { X } from "lucide-react";
import type { DcaPlan } from "./types";

interface AutoPlanPayload {
  autoExecute: boolean;
  autoDayOfWeek: number | null;
  autoStartDate: string | null;
  broker: string | null;
}

export function AutoPlanModal({
  plan, onClose, onSave,
}: {
  plan: DcaPlan; onClose: () => void;
  onSave: (data: AutoPlanPayload) => void;
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
      <div className="bg-card border border-border-strong rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Plan automático — {plan.asset}</h3>
          <button onClick={onClose} className="p-1 hover:bg-elevated rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground leading-relaxed">
            Si tienes este activo configurado en <b>Plan de Ahorro (Sparplan)</b> en Trade Republic
            o en un plan recurrente de Binance, actívalo aquí. FinTrack marcará la compra semanal
            como hecha automáticamente el día en que se ejecute, sin que tengas que tocar nada.
          </div>

          <div className="flex items-center gap-3 p-3 bg-elevated rounded-lg">
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
                <label className="text-xs text-muted-foreground mb-1 block">Broker</label>
                <select value={broker} onChange={e => setBroker(e.target.value)}
                  className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm">
                  <option value="Trade Republic">Trade Republic (Sparplan)</option>
                  <option value="Binance">Binance (Plan Auto-Invest)</option>
                  <option value="Revolut">Revolut</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Día de la semana de ejecución</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DOW_OPTIONS.map(o => (
                    <button key={o.v}
                      onClick={() => setDay(o.v)}
                      className={`py-2 px-2 text-xs rounded-lg font-medium transition-colors ${
                        day === o.v
                          ? "bg-info text-info-foreground"
                          : "bg-elevated text-muted-foreground hover:text-foreground"
                      }`}>
                      {o.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-2">
                  Recomendado: martes/miércoles (evita lunes/viernes — menor volumen y spreads peores).
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Primera ejecución (opcional)</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50" />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Si tu plan empieza en una fecha futura (p.ej. 4 mayo), ponla aquí. Las semanas anteriores NO se marcan como auto.
                </div>
              </div>
              <div className="bg-info-soft border border-info/30 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
                <b className="text-info">Cómo funciona:</b> cada {DOW_OPTIONS.find(o => o.v === day)?.label.toLowerCase()}
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
          })} className="w-full py-2.5 bg-success text-success-foreground hover:opacity-90 rounded-lg text-sm font-semibold">
            Guardar configuración
          </button>
          {plan.autoExecute && (
            <button onClick={() => onSave({ autoExecute: false, autoDayOfWeek: null, autoStartDate: null, broker: null })}
              className="w-full py-2 text-xs text-danger hover:opacity-80">
              Desactivar plan automático
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
