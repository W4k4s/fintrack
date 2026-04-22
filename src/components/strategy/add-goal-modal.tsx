"use client";
import { useState } from "react";
import { X } from "lucide-react";

export function AddGoalModal({
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
      <div className="bg-card border border-border-strong rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Nuevo objetivo</h3>
          <button onClick={onClose} className="p-1 hover:bg-elevated rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input placeholder="Nombre del objetivo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50" />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
            className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm">
            <option value="net_worth">Patrimonio</option>
            <option value="asset_target">Acumular asset</option>
            <option value="savings_rate">Savings rate</option>
            <option value="emergency_fund">Fondo emergencia</option>
            <option value="custom">Personalizado</option>
          </select>
          {form.type === "asset_target" && (
            <input placeholder="Asset (BTC, MSCI World...)" value={form.targetAsset}
              onChange={e => setForm({ ...form, targetAsset: e.target.value })}
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Valor objetivo" value={form.targetValue}
              onChange={e => setForm({ ...form, targetValue: e.target.value })}
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm tabular-nums focus:outline-none focus:border-success/50" />
            <select value={form.targetUnit} onChange={e => setForm({ ...form, targetUnit: e.target.value })}
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="units">Unidades</option>
              <option value="percent">%</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50" />
            <select value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm">
              <option value={1}>Alta</option>
              <option value={2}>Media</option>
              <option value={3}>Baja</option>
            </select>
          </div>
          <button disabled={!form.name || !form.targetValue} onClick={() => onSave({
            profileId, name: form.name, type: form.type,
            targetValue: parseFloat(form.targetValue), targetAsset: form.targetAsset || null,
            targetUnit: form.targetUnit, deadline: form.deadline || null, priority: form.priority,
          })} className="w-full py-2.5 bg-success text-success-foreground hover:opacity-90 disabled:opacity-40 rounded-lg text-sm font-semibold">
            Crear objetivo
          </button>
        </div>
      </div>
    </div>
  );
}
