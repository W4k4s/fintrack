"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  id: number;
  status: string;
}

export function ResearchActions({ id, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/intel/research/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
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

  const btn = "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "failed" && (
          <button
            disabled={busy != null}
            onClick={() => act("retry")}
            className={`${btn} border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20`}
          >
            {busy === "retry" ? "Reintentando…" : "🔁 Reintentar"}
          </button>
        )}
        {(status === "researched" || status === "shortlisted" || status === "watching") && (
          <>
            {status !== "shortlisted" && (
              <button
                disabled={busy != null}
                onClick={() => act("promote_shortlisted")}
                className={`${btn} border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20`}
              >
                {busy === "promote_shortlisted" ? "…" : "→ Shortlist"}
              </button>
            )}
            {status !== "watching" && (
              <button
                disabled={busy != null}
                onClick={() => {
                  const thesis = window.prompt("Tesis corta (qué catalizador vigila, por qué):");
                  if (!thesis) return;
                  act("promote_watching", { thesis });
                }}
                className={`${btn} border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20`}
              >
                {busy === "promote_watching" ? "…" : "→ Watching"}
              </button>
            )}
            <button
              disabled={busy != null}
              onClick={() => {
                const entryPriceStr = window.prompt("Precio de entrada (EUR/USD como lo tenga el broker):");
                const entryPrice = entryPriceStr ? Number(entryPriceStr) : undefined;
                if (entryPriceStr && !Number.isFinite(entryPrice)) {
                  setErr("Precio inválido");
                  return;
                }
                act("promote_open", { entryPrice });
              }}
              className={`${btn} border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20`}
            >
              {busy === "promote_open" ? "…" : "→ Posición abierta"}
            </button>
          </>
        )}
        {status !== "archived" && status !== "closed" && status !== "failed" && (
          <button
            disabled={busy != null}
            onClick={() => {
              if (!window.confirm("¿Archivar? Puedes volver a lanzar el research después.")) return;
              act("archive");
            }}
            className={`${btn} border-zinc-500/30 bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20`}
          >
            {busy === "archive" ? "…" : "✗ Archivar"}
          </button>
        )}
      </div>
      {err && <div className="text-xs text-red-400">✗ {err}</div>}
    </div>
  );
}
