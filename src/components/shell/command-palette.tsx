"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Coins, Radar, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "./command-palette-context";
import { NAV_ITEMS } from "./nav-items";

type Item = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  kind: "page" | "asset" | "signal";
};

type AssetsResponse = { assets: { symbol: string; value?: number; total?: number }[] };
type SignalsResponse = { signals: { id: number; title: string; severity?: string; scope?: string }[] };

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<{ symbol: string }[]>([]);
  const [signals, setSignals] = useState<{ id: number; title: string; severity?: string; scope?: string }[]>([]);
  const [selected, setSelected] = useState(0);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  // Lazy-load data the first time it opens
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        const [a, s] = await Promise.all([
          fetch("/api/assets", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<AssetsResponse>) : { assets: [] })),
          fetch("/api/intel?status=unread&limit=8", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<SignalsResponse>) : { signals: [] })),
        ]);
        if (!alive) return;
        setAssets(Array.isArray(a.assets) ? a.assets.slice(0, 30) : []);
        setSignals(Array.isArray(s.signals) ? s.signals : []);
      } catch {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, [isOpen]);

  const items: Item[] = useMemo(() => {
    const all: Item[] = [];
    for (const n of NAV_ITEMS) {
      all.push({ id: `page:${n.href}`, label: n.label, sub: n.href, href: n.href, kind: "page" });
    }
    for (const a of assets) {
      all.push({
        id: `asset:${a.symbol}`,
        label: a.symbol,
        sub: "Asset",
        href: `/assets/${encodeURIComponent(a.symbol)}`,
        kind: "asset",
      });
    }
    for (const s of signals) {
      all.push({
        id: `signal:${s.id}`,
        label: s.title,
        sub: `${s.severity || "signal"} · ${s.scope || "intel"}`,
        href: `/intel/${s.id}`,
        kind: "signal",
      });
    }
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 30);
    const filtered = all.filter((it) =>
      it.label.toLowerCase().includes(q) || it.sub?.toLowerCase().includes(q),
    );
    return filtered.slice(0, 40);
  }, [assets, signals, query]);

  // Keep selected in range
  useEffect(() => {
    if (selected >= items.length) setSelected(0);
  }, [items.length, selected]);

  const navigate = (item: Item) => {
    close();
    router.push(item.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (items.length ? (s + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[selected];
      if (it) navigate(it);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search assets, signals, pages…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] font-mono text-muted-foreground/80 px-1.5 py-0.5 rounded border border-border bg-elevated">
            esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            <ul>
              {items.map((it, idx) => {
                const Icon = it.kind === "page" ? FileText : it.kind === "asset" ? Coins : Radar;
                const active = idx === selected;
                return (
                  <li key={it.id}>
                    <button
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => navigate(it)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-left text-sm",
                        active ? "bg-[var(--hover-bg)]" : "",
                      )}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{it.label}</div>
                        {it.sub && (
                          <div className="text-[11px] text-muted-foreground font-mono truncate">{it.sub}</div>
                        )}
                      </div>
                      {active && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-[10px] text-muted-foreground border-t border-border font-mono">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> navigate</span>
            <span className="inline-flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> open</span>
          </span>
          <span>{items.length} results</span>
        </div>
      </div>
    </div>
  );
}
