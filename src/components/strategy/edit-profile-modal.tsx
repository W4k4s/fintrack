"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  PARENT_ORDER, PARENT_LABEL, SUB_LABEL, SUBS_BY_PARENT,
  type ParentTab, type StrategyProfile, type SubTargetForm,
} from "./types";

export function EditProfileModal({
  profile, onClose, onSave,
}: {
  profile: StrategyProfile; onClose: () => void;
  onSave: (payload: {
    profileUpdate: Partial<StrategyProfile>;
    subTargets: SubTargetForm[];
  }) => void;
}) {
  const [meta, setMeta] = useState({
    monthlyInvest: profile.monthlyInvest,
    emergencyMonths: profile.emergencyMonths,
    riskProfile: profile.riskProfile,
    tagline: profile.tagline ?? "",
    philosophy: profile.philosophy ?? "",
    monthlyFixedExpenses: profile.monthlyFixedExpenses ?? 0,
  });
  const [subTargets, setSubTargets] = useState<SubTargetForm[]>([]);
  const [activeTab, setActiveTab] = useState<ParentTab>("cash");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/strategy/sub-targets");
        const data = await res.json();
        setSubTargets(data.subTargets ?? []);
      } catch (e) {
        console.error("[edit-profile] load sub-targets:", e);
      }
      setLoading(false);
    })();
  }, []);

  const total = subTargets.reduce((acc, s) => acc + s.targetPct, 0);
  const byParentTotal = (parent: ParentTab) =>
    subTargets.filter((s) => s.parentClass === parent).reduce((a, s) => a + s.targetPct, 0);

  const updateSubPct = (subClass: string, value: number) => {
    setSubTargets((prev) =>
      prev.map((s) =>
        s.subClass === subClass ? { ...s, targetPct: Math.max(0, Math.min(100, value)) } : s,
      ),
    );
  };

  const ensureSubExists = (parent: ParentTab, subClass: string): SubTargetForm => {
    const existing = subTargets.find((s) => s.subClass === subClass);
    if (existing) return existing;
    const placeholder: SubTargetForm = { subClass, parentClass: parent, targetPct: 0 };
    setSubTargets((prev) => [...prev, placeholder]);
    return placeholder;
  };

  const canSave = Math.abs(total - 100) <= 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border-strong rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Editar estrategia</h3>
          <button onClick={onClose} className="p-1 hover:bg-elevated rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tagline (titular de la estrategia)</label>
            <input
              type="text"
              maxLength={300}
              value={meta.tagline}
              onChange={e => setMeta({ ...meta, tagline: e.target.value })}
              placeholder="Ej. Core + Satellite 2026 — núcleo diversificado + satélites con tesis"
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Philosophy (se muestra en /strategy/guide)</label>
            <textarea
              rows={4}
              maxLength={5000}
              value={meta.philosophy}
              onChange={e => setMeta({ ...meta, philosophy: e.target.value })}
              placeholder="Filosofía de inversión en 2-4 párrafos. Se renderiza en la página educativa."
              className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm leading-relaxed focus:outline-none focus:border-success/50" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Perfil de riesgo</label>
              <select value={meta.riskProfile} onChange={e => setMeta({ ...meta, riskProfile: e.target.value })}
                className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm">
                <option value="conservative">Conservador</option>
                <option value="balanced">Equilibrado</option>
                <option value="growth">Crecimiento</option>
                <option value="aggressive">Agresivo</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">DCA mensual (€)</label>
              <input type="number" value={meta.monthlyInvest} onChange={e => setMeta({ ...meta, monthlyInvest: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm tabular-nums focus:outline-none focus:border-success/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gastos fijos (€/mes)</label>
              <input type="number"
                value={meta.monthlyFixedExpenses}
                onChange={e => setMeta({ ...meta, monthlyFixedExpenses: parseFloat(e.target.value) || 0 })}
                title="Gastos obligatorios (alquiler, préstamos, suministros). Alimenta el fondo emergencia."
                className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm tabular-nums focus:outline-none focus:border-success/50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Meses emergencia</label>
              <input type="number" value={meta.emergencyMonths} onChange={e => setMeta({ ...meta, emergencyMonths: parseInt(e.target.value) || 3 })}
                className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm tabular-nums focus:outline-none focus:border-success/50" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground">Allocation por sub-clase (suma = 100%)</label>
              <span className={`text-xs font-mono tabular-nums ${canSave ? "text-success" : "text-danger"}`}>
                Total {total.toFixed(2)}% {canSave ? "✓" : "(debe ser 100 ±0.01)"}
              </span>
            </div>

            <div className="flex gap-1 border-b border-border-strong mb-3 overflow-x-auto">
              {PARENT_ORDER.map((p) => {
                const pct = byParentTotal(p);
                const isActive = activeTab === p;
                return (
                  <button
                    key={p}
                    onClick={() => setActiveTab(p)}
                    className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition ${
                      isActive ? "border-success text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {PARENT_LABEL[p]} <span className="font-mono tabular-nums opacity-70">{pct.toFixed(1)}%</span>
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground text-center py-6">Cargando sub-targets…</div>
            ) : (
              <div className="space-y-2">
                {SUBS_BY_PARENT[activeTab].map((subClass) => {
                  const entry = subTargets.find((s) => s.subClass === subClass) ?? ensureSubExists(activeTab, subClass);
                  return (
                    <div key={subClass} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{SUB_LABEL[subClass] ?? subClass}</div>
                        <div className="text-xs text-muted-foreground font-mono">{subClass}</div>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={entry.targetPct}
                        onChange={(e) => updateSubPct(subClass, parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm text-right font-mono tabular-nums focus:outline-none focus:border-success/50"
                      />
                      <span className="text-xs text-muted-foreground w-6">%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            disabled={!canSave || loading}
            onClick={() =>
              onSave({
                profileUpdate: {
                  id: profile.id,
                  monthlyInvest: meta.monthlyInvest,
                  emergencyMonths: meta.emergencyMonths,
                  riskProfile: meta.riskProfile,
                  tagline: meta.tagline.trim() || null,
                  philosophy: meta.philosophy.trim() || null,
                  monthlyFixedExpenses: meta.monthlyFixedExpenses,
                },
                subTargets,
              })
            }
            className="w-full py-2.5 bg-success text-success-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
