"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { DcaPlan } from "./types";

interface ExecutePayload {
  planId: number; amount: number;
  price?: number; units?: number; notes?: string;
}

export function DcaExecuteDrawer({
  plan, onClose, onSubmit, onSync,
}: {
  plan: DcaPlan | null; onClose: () => void;
  onSubmit: (data: ExecutePayload) => Promise<void> | void;
  onSync: () => void;
}) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (plan) {
      setAmount(plan.amount.toString());
      setPrice("");
      setNotes("");
      setMode("auto");
      setSubmitting(false);
    }
  }, [plan?.id]);

  useEffect(() => {
    if (!plan) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, onClose]);

  if (!plan) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      onSync();
      onClose();
    } catch (e) { console.error(e); }
    setSyncing(false);
  };

  const handleManualSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt) return;
    setSubmitting(true);
    const payload: ExecutePayload = {
      planId: plan.id,
      amount: amt,
      price: price ? parseFloat(price) : undefined,
      units: price ? amt / parseFloat(price) : undefined,
      notes: notes || undefined,
    };
    try {
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        className="w-full max-w-md bg-card border-l border-border-strong shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 md:max-w-md max-md:rounded-t-2xl max-md:max-h-[90vh] max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:max-w-none max-md:border-l-0 max-md:border-t max-md:animate-in max-md:slide-in-from-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Registrar compra</div>
            <h3 className="text-lg font-semibold text-foreground">{plan.asset}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-elevated rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex gap-1 bg-elevated rounded-lg p-0.5">
            <button
              onClick={() => setMode("auto")}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                mode === "auto" ? "bg-success text-success-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >Desde exchange</button>
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                mode === "manual" ? "bg-success text-success-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >Manual</button>
          </div>

          {mode === "auto" ? (
            <div className="space-y-3">
              <div className="bg-elevated rounded-lg p-4 text-center space-y-2">
                <div className="text-sm text-foreground">Sincronizar con Binance/exchanges conectadas</div>
                <div className="text-xs text-muted-foreground">
                  Detecta tus compras de <span className="text-foreground font-medium">{plan.asset}</span> y las vincula a este plan.
                </div>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="w-full py-2.5 bg-success text-success-foreground hover:opacity-90 disabled:opacity-50 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
              >
                {syncing ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-2 border-success-foreground border-t-transparent" /> Sincronizando…</>
                ) : "🔄 Sync y vincular"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Importe (€)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm tabular-nums focus:outline-none focus:border-success/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Precio de compra (opcional)</label>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="Precio por unidad"
                  className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm tabular-nums focus:outline-none focus:border-success/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notas (opcional)</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ej: Compra OTC"
                  className="w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm focus:outline-none focus:border-success/50"
                />
              </div>
              <button
                onClick={handleManualSubmit}
                disabled={submitting || !amount}
                className="w-full py-2.5 bg-success text-success-foreground hover:opacity-90 disabled:opacity-50 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
              >
                {submitting ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-2 border-success-foreground border-t-transparent" /> Registrando…</>
                ) : "Registrar compra"}
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-elevated rounded text-[10px] font-mono">Esc</kbd> para cerrar
        </div>
      </div>
    </div>
  );
}
