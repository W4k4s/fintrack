"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Target, ExternalLink } from "lucide-react";

interface WatchRow {
  id: number;
  ticker: string;
  name: string | null;
  status: "watching" | "open_position" | string;
  verdict: string | null;
  subClass: string | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  timeHorizonMonths: number | null;
  thesis: string | null;
}

interface PriceMap {
  [symbol: string]: number;
}

function isInEntryWindow(current: number | null, entry: number | null): boolean {
  if (current == null || entry == null) return false;
  const pctFromEntry = (current - entry) / entry;
  return pctFromEntry >= -0.1 && pctFromEntry <= 0;
}

function statusBadge(status: string, verdict: string | null): { label: string; color: string } {
  if (status === "open_position") return { label: "Abierta", color: "text-emerald-400 border-emerald-500/30" };
  if (verdict === "candidate") return { label: "Candidata", color: "text-blue-400 border-blue-500/30" };
  if (verdict === "wait") return { label: "Watching", color: "text-amber-400 border-amber-500/30" };
  return { label: status, color: "text-zinc-400 border-zinc-600" };
}

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    // Endpoint interno que intenta resolver ticker → precio actual via Yahoo/CoinGecko.
    const res = await fetch(`/api/intel/research/price?ticker=${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.price === "number" ? data.price : null;
  } catch {
    return null;
  }
}

export function WatchlistCard() {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/intel/research?status=watching,open_position");
        const data = await res.json();
        const items: WatchRow[] = data.items ?? [];
        if (cancelled) return;
        setRows(items);
        setLoading(false);

        const priceMap: PriceMap = {};
        await Promise.all(
          items.map(async (it) => {
            const p = await fetchCurrentPrice(it.ticker);
            if (p != null) priceMap[it.ticker] = p;
          }),
        );
        if (!cancelled) setPrices(priceMap);
      } catch (e) {
        console.error("[watchlist-card]", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Eye className="w-4 h-4 text-info" /> Watchlist
        </div>
        <div className="text-xs text-muted-foreground">Cargando…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold mb-2">
          <Eye className="w-4 h-4 text-info" /> Watchlist
        </div>
        <div className="text-xs text-muted-foreground">
          No hay tesis activas. Abre una en <Link href="/intel/research" className="underline">/intel/research</Link>.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="w-4 h-4 text-info" /> Watchlist
          <span className="text-xs text-muted-foreground font-normal">{rows.length} tesis</span>
        </div>
        <Link href="/intel/research" className="text-xs text-info hover:underline flex items-center gap-1">
          Ir a research <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const badge = statusBadge(r.status, r.verdict);
          const current = prices[r.ticker] ?? null;
          const inWindow = isInEntryWindow(current, r.entryPrice);
          const pctFromEntry =
            current != null && r.entryPrice != null
              ? ((current - r.entryPrice) / r.entryPrice) * 100
              : null;
          return (
            <Link
              key={r.id}
              href={`/intel/tracked/${r.id}`}
              className="block bg-elevated/50 hover:bg-elevated border border-border rounded-lg p-3 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-foreground">{r.ticker}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.color}`}>
                      {badge.label}
                    </span>
                    {inWindow && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Target className="w-2.5 h-2.5" /> Entry window
                      </span>
                    )}
                  </div>
                  {r.thesis && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{r.thesis}</p>
                  )}
                </div>
                <div className="text-right text-xs tabular-nums font-mono shrink-0">
                  <div className="text-muted-foreground">
                    entry {r.entryPrice ?? "—"} / stop {r.stopPrice ?? "—"} / tgt {r.targetPrice ?? "—"}
                  </div>
                  {current != null ? (
                    <div className={pctFromEntry != null && pctFromEntry >= 0 ? "text-emerald-400" : "text-amber-400"}>
                      actual {current.toFixed(2)} {pctFromEntry != null && `(${pctFromEntry > 0 ? "+" : ""}${pctFromEntry.toFixed(1)}%)`}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">actual —</div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
