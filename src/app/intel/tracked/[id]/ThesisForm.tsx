"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Initial {
  thesis: string;
  entryPlan: string;
  entryPrice: number | null;
  entryDate: string | null;
  targetPrice: number | null;
  stopPrice: number | null;
  timeHorizonMonths: number | null;
}

interface Props {
  id: number;
  status: "watching" | "open_position";
  initial: Initial;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function parseNumberOrNull(v: string): number | null | undefined {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined; // undefined = inválido → no tocar
}

export function ThesisForm({ id, status, initial }: Props) {
  const router = useRouter();
  const [thesis, setThesis] = useState(initial.thesis);
  const [entryPlan, setEntryPlan] = useState(initial.entryPlan);
  const [entryPrice, setEntryPrice] = useState(initial.entryPrice?.toString() ?? "");
  const [entryDate, setEntryDate] = useState(toDateInput(initial.entryDate));
  const [targetPrice, setTargetPrice] = useState(initial.targetPrice?.toString() ?? "");
  const [stopPrice, setStopPrice] = useState(initial.stopPrice?.toString() ?? "");
  const [horizon, setHorizon] = useState(initial.timeHorizonMonths?.toString() ?? "");
  const [busy, setBusy] = useState<null | "save" | "open" | "close">(null);
  const [err, setErr] = useState<string | null>(null);

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = { thesis, entryPlan };
    const parsers: Array<[string, string]> = [
      ["entryPrice", entryPrice],
      ["targetPrice", targetPrice],
      ["stopPrice", stopPrice],
      ["timeHorizonMonths", horizon],
    ];
    for (const [key, raw] of parsers) {
      const n = parseNumberOrNull(raw);
      if (n === undefined) continue; // inválido → saltamos para no enviar basura
      if (n !== null) payload[key] = n;
    }
    if (entryDate) payload.entryDate = `${entryDate}T00:00:00.000Z`;
    return payload;
  }

  async function save() {
    setBusy("save");
    setErr(null);
    try {
      const res = await fetch(`/api/intel/research/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `http ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function promoteOpen() {
    setBusy("open");
    setErr(null);
    try {
      const res = await fetch(`/api/intel/research/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote_open", ...buildPayload() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `http ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    const reason = window.prompt("Motivo de cierre (stop, target, expiración, cambio de tesis…):");
    if (!reason) return;
    setBusy("close");
    setErr(null);
    try {
      const res = await fetch(`/api/intel/research/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_position", closedReason: reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `http ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const input = "w-full rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm";
  const btn = "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3">
        <label className="space-y-1 block">
          <span className="text-xs text-muted-foreground">Tesis (por qué este activo, catalizador)</span>
          <textarea
            className={`${input} h-24`}
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            maxLength={2000}
            placeholder="Ej: GTA6 lanzamiento 2026, pricing power Rockstar, mercado infravalora delay…"
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs text-muted-foreground">Entry plan (cómo entrar)</span>
          <input
            className={input}
            value={entryPlan}
            onChange={(e) => setEntryPlan(e.target.value)}
            maxLength={500}
            placeholder="DCA 4 tramos semanal mientras precio < 115"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Entry price</span>
            <input
              className={input}
              type="number"
              step="any"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Entry date</span>
            <input
              className={input}
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Target price</span>
            <input
              className={input}
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Stop price (SOFT)</span>
            <input
              className={input}
              type="number"
              step="any"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
            />
          </label>
          <label className="space-y-1 block col-span-2">
            <span className="text-xs text-muted-foreground">Horizon (meses)</span>
            <input
              className={input}
              type="number"
              step="1"
              min="1"
              max="60"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="submit"
          disabled={busy !== null}
          className={`${btn} border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20`}
        >
          {busy === "save" ? "Guardando…" : "💾 Guardar tesis"}
        </button>
        {status === "watching" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void promoteOpen()}
            className={`${btn} border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20`}
          >
            {busy === "open" ? "…" : "→ Abrir posición"}
          </button>
        )}
        {status === "open_position" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void close()}
            className={`${btn} border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20`}
          >
            {busy === "close" ? "…" : "✗ Cerrar posición"}
          </button>
        )}
      </div>

      {err && <div className="text-xs text-red-400">✗ {err}</div>}
    </form>
  );
}
