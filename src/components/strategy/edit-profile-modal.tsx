"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  PARENT_ORDER, PARENT_LABEL, SUB_LABEL, SUBS_BY_PARENT,
  type ParentTab, type StrategyProfile, type SubTargetForm,
} from "./types";

// R2-A: edición estructurada de policies sin JSON raw.
interface PoliciesForm {
  cryptoPauseAbovePct: number;
  cryptoBtcOnlyLow: number;
  cryptoBtcOnlyHigh: number;
  cryptoFullBelowPct: number;
  multFgThreshold: number;
  multAppliesTo: string; // CSV en UI ("BTC, ETH") — se splitea al guardar
  multRequiresCryptoUnderPct: number;
  themMaxPositionPct: number;
  themMaxOpen: number;
}

const DEFAULT_POLICIES_FORM: PoliciesForm = {
  cryptoPauseAbovePct: 17,
  cryptoBtcOnlyLow: 15,
  cryptoBtcOnlyHigh: 17,
  cryptoFullBelowPct: 15,
  multFgThreshold: 24,
  multAppliesTo: "BTC",
  multRequiresCryptoUnderPct: 17,
  themMaxPositionPct: 3,
  themMaxOpen: 4,
};

function parseExistingPolicies(raw: string | null): PoliciesForm {
  if (!raw) return DEFAULT_POLICIES_FORM;
  try {
    const p = JSON.parse(raw);
    return {
      cryptoPauseAbovePct: p.crypto?.pauseAbovePct ?? 17,
      cryptoBtcOnlyLow: p.crypto?.btcOnlyBetween?.[0] ?? 15,
      cryptoBtcOnlyHigh: p.crypto?.btcOnlyBetween?.[1] ?? 17,
      cryptoFullBelowPct: p.crypto?.fullBelowPct ?? 15,
      multFgThreshold: p.multiplier?.fgThreshold ?? 24,
      multAppliesTo: (p.multiplier?.appliesTo ?? ["BTC"]).join(", "),
      multRequiresCryptoUnderPct: p.multiplier?.requiresCryptoUnderPct ?? 17,
      themMaxPositionPct: p.thematic?.maxPositionPct ?? 3,
      themMaxOpen: p.thematic?.maxOpen ?? 4,
    };
  } catch {
    return DEFAULT_POLICIES_FORM;
  }
}

function serializeFormPolicies(f: PoliciesForm): string {
  return JSON.stringify({
    crypto: {
      pauseAbovePct: f.cryptoPauseAbovePct,
      btcOnlyBetween: [f.cryptoBtcOnlyLow, f.cryptoBtcOnlyHigh],
      fullBelowPct: f.cryptoFullBelowPct,
    },
    multiplier: {
      fgThreshold: f.multFgThreshold,
      appliesTo: f.multAppliesTo.split(",").map((s) => s.trim()).filter(Boolean),
      requiresCryptoUnderPct: f.multRequiresCryptoUnderPct,
    },
    thematic: {
      maxPositionPct: f.themMaxPositionPct,
      maxOpen: f.themMaxOpen,
      requireThesisFields: ["entryPrice", "targetPrice", "stopPrice", "timeHorizonMonths"],
    },
  });
}

function validateFormPolicies(f: PoliciesForm): string | null {
  if (f.cryptoBtcOnlyLow >= f.cryptoBtcOnlyHigh) return "BTC-only: low debe ser < high";
  if (f.multAppliesTo.trim().length === 0) return "multiplier.appliesTo: al menos 1 asset";
  if (!Number.isInteger(f.themMaxOpen) || f.themMaxOpen < 0) return "thematic.maxOpen: entero >= 0";
  for (const field of ["cryptoPauseAbovePct", "cryptoFullBelowPct", "multFgThreshold", "multRequiresCryptoUnderPct", "themMaxPositionPct"] as const) {
    const v = f[field];
    if (typeof v !== "number" || v < 0 || v > 100) return `${field} debe estar entre 0 y 100`;
  }
  return null;
}

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
  const [policies, setPolicies] = useState<PoliciesForm>(() => parseExistingPolicies(profile.policiesJson));
  const [subTargets, setSubTargets] = useState<SubTargetForm[]>([]);
  const [activeTab, setActiveTab] = useState<ParentTab>("cash");
  const [loading, setLoading] = useState(true);
  const [showPolicies, setShowPolicies] = useState(false);

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

  const policiesError = validateFormPolicies(policies);
  const canSave = Math.abs(total - 100) <= 0.01 && policiesError == null;

  const updatePolicy = <K extends keyof PoliciesForm>(key: K, value: PoliciesForm[K]) =>
    setPolicies((prev) => ({ ...prev, [key]: value }));

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

          {/* Policies (colapsable) */}
          <div className="border border-border-strong rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPolicies(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-elevated hover:bg-elevated/70"
            >
              <span>Policies (crypto / multiplicador F&G / thematic plays)</span>
              <span className="text-xs text-muted-foreground">{showPolicies ? "ocultar" : "mostrar"}</span>
            </button>
            {showPolicies && (
              <div className="p-4 space-y-4 bg-card">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Crypto transition</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <LabeledNumber label="Pausa total si ≥" suffix="%"
                      value={policies.cryptoPauseAbovePct}
                      onChange={(v) => updatePolicy("cryptoPauseAbovePct", v)} />
                    <LabeledNumber label="BTC-only low ≥" suffix="%"
                      value={policies.cryptoBtcOnlyLow}
                      onChange={(v) => updatePolicy("cryptoBtcOnlyLow", v)} />
                    <LabeledNumber label="BTC-only high <" suffix="%"
                      value={policies.cryptoBtcOnlyHigh}
                      onChange={(v) => updatePolicy("cryptoBtcOnlyHigh", v)} />
                    <LabeledNumber label="Full-crypto si <" suffix="%"
                      value={policies.cryptoFullBelowPct}
                      onChange={(v) => updatePolicy("cryptoFullBelowPct", v)} />
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Multiplicador F&G</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <LabeledNumber label="FG threshold ≤" value={policies.multFgThreshold}
                      onChange={(v) => updatePolicy("multFgThreshold", v)} />
                    <LabeledNumber label="Requiere crypto <" suffix="%"
                      value={policies.multRequiresCryptoUnderPct}
                      onChange={(v) => updatePolicy("multRequiresCryptoUnderPct", v)} />
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Aplica a (CSV)</label>
                      <input type="text" value={policies.multAppliesTo}
                        onChange={(e) => updatePolicy("multAppliesTo", e.target.value)}
                        placeholder="BTC, ETH"
                        className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Thematic plays</div>
                  <div className="grid grid-cols-2 gap-2">
                    <LabeledNumber label="Max position" suffix="%" value={policies.themMaxPositionPct}
                      onChange={(v) => updatePolicy("themMaxPositionPct", v)} />
                    <LabeledNumber label="Max abiertas" value={policies.themMaxOpen}
                      onChange={(v) => updatePolicy("themMaxOpen", v)} />
                  </div>
                </div>

                {policiesError && (
                  <div className="text-xs text-danger">⚠ {policiesError}</div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground">Allocation por sub-clase (suma = 100%)</label>
              <span className={`text-xs font-mono tabular-nums ${Math.abs(total - 100) <= 0.01 ? "text-success" : "text-danger"}`}>
                Total {total.toFixed(2)}% {Math.abs(total - 100) <= 0.01 ? "✓" : "(debe ser 100 ±0.01)"}
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
                  policiesJson: serializeFormPolicies(policies),
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

function LabeledNumber({
  label, value, onChange, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm text-right tabular-nums font-mono focus:outline-none focus:border-success/50"
        />
        {suffix && <span className="text-xs text-muted-foreground w-4">{suffix}</span>}
      </div>
    </div>
  );
}
