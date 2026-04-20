"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewResearchForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/intel/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim(), note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `http ${res.status}`);
        return;
      }
      const j = await res.json();
      setTicker("");
      setNote("");
      router.push(`/intel/research/${j.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (p.ej. TTWO, SAN.MC, BTC)"
          maxLength={32}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono w-44 focus:outline-none focus:border-accent"
          disabled={busy}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota corta (opcional, p.ej. GTA6 catalyst)"
          maxLength={500}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-accent"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !ticker.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          {busy ? "Lanzando…" : "+ Estudiar activo"}
        </button>
      </div>
      {err && <div className="text-xs text-red-400">✗ {err}</div>}
      <div className="text-xs text-muted-foreground">
        Tarda ~1-2 min en completar. El dossier incluye veredicto, disqualifiers, correlación vs tus holdings y técnica actual.
      </div>
    </form>
  );
}
