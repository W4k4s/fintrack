"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIntelUnread } from "@/hooks/use-intel-unread";

type Signal = {
  id: number;
  title: string;
  summary?: string;
  severity: "low" | "medium" | "high" | "critical";
  scope: string;
  asset?: string;
  createdAt?: string;
};

const SEVERITY_STYLES: Record<Signal["severity"], string> = {
  critical: "bg-danger-soft text-danger",
  high:     "bg-danger-soft text-danger",
  medium:   "bg-warn-soft text-warn",
  low:      "bg-info-soft text-info",
};

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export function IntelBell({ className }: { className?: string }) {
  const { count, refresh } = useIntelUnread();
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside / escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current || !btnRef.current) return;
      if (popRef.current.contains(e.target as Node)) return;
      if (btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Panel alineado con el badge: sólo actionable (mismo filtro que unreadCount).
        const res = await fetch("/api/intel?status=unread&kind=actionable&limit=10", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setSignals(Array.isArray(data.signals) ? data.signals : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open]);

  const markAllRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      // Bulk endpoint: marca TODAS las unread actionable, no sólo las visibles.
      // Antes hacía N PATCHs a las 5 signals del panel; si el badge contaba
      // señales fuera de esas 5 (orden DESC puede dejar actionable antiguas
      // abajo), el contador no bajaba.
      await fetch("/api/intel/mark-all-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "actionable" }),
      });
      setSignals([]);
      await refresh();
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Intel notifications (${count} unread)` : "Intel notifications"}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)] transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-[9px] font-semibold leading-[16px] text-center text-danger-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-card shadow-xl overflow-hidden"
          role="dialog"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Intel</span>
              {count > 0 && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {count} unread
                </span>
              )}
            </div>
            {signals.length > 0 && (
              <button
                onClick={markAllRead}
                disabled={marking}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
            ) : signals.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <div className="text-sm text-muted-foreground">No unread signals</div>
                <div className="text-[11px] text-muted-foreground/80 mt-1">You're all caught up.</div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {signals.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/intel/${s.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 hover:bg-[var(--hover-bg)] transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                            SEVERITY_STYLES[s.severity] || SEVERITY_STYLES.low,
                          )}
                        >
                          {s.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium leading-snug line-clamp-2">
                            {s.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                            <span>{s.scope}</span>
                            {s.asset && <span>· {s.asset}</span>}
                            {s.createdAt && <span>· {relativeTime(s.createdAt)}</span>}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/intel"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium py-2.5 border-t border-border text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)] transition-colors"
          >
            Open Intel →
          </Link>
        </div>
      )}
    </div>
  );
}
