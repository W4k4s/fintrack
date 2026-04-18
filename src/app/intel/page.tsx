import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { parseHeadlineShort } from "./[id]/analysis";

export const dynamic = "force-dynamic";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  med: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const SCOPE_ICONS: Record<string, string> = {
  price_dip: "📉",
  price_surge: "📈",
  fg_regime: "😱",
  funding_anomaly: "💸",
  news: "📰",
  macro_event: "🏦",
  drift: "⚖️",
  tax_harvest: "🧾",
  rebalance: "🔄",
  dca_pending: "🔔",
  custom: "⚙️",
};

const STATUS_COLORS: Record<string, string> = {
  unread: "text-accent",
  read: "text-muted-foreground",
  acted: "text-green-400",
  dismissed: "text-zinc-500",
  snoozed: "text-blue-400",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default async function IntelPage() {
  const signals = await db
    .select()
    .from(schema.intelSignals)
    .orderBy(desc(schema.intelSignals.createdAt))
    .limit(100);

  const unread = signals.filter((s) => s.userStatus === "unread").length;
  const byStatus = {
    unread,
    total: signals.length,
    acted: signals.filter((s) => s.userStatus === "acted").length,
  };

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Intel</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Señales detectadas por reglas + análisis Claude. Motor de alertas de la estrategia.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Sin leer</div>
              <div className="text-lg font-semibold text-accent">{byStatus.unread}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Totales</div>
              <div className="text-lg font-semibold">{byStatus.total}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Ejecutadas</div>
              <div className="text-lg font-semibold text-green-400">{byStatus.acted}</div>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <Link
            href="/intel/news"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            📰 Ver todas las noticias procesadas →
          </Link>
        </div>
      </header>

      {signals.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-2">🟢</div>
          <div className="text-sm text-muted-foreground">
            Sin señales por ahora. El motor revisa cada 15 min.
          </div>
          <div className="mt-4">
            <form action="/api/intel/tick" method="POST">
              <button
                formAction="/api/intel/tick?scope=all"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
              >
                Disparar tick manual
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {signals.map((s) => {
          const headline = parseHeadlineShort(s.analysisText) ?? s.title;
          return (
            <Link
              key={s.id}
              href={`/intel/${s.id}`}
              className={`block rounded-xl border border-border bg-card hover:bg-[var(--hover-bg)] transition-colors p-4 ${
                s.userStatus === "unread" ? "ring-1 ring-accent/30" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{SCOPE_ICONS[s.scope] || "•"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                        SEVERITY_COLORS[s.severity]
                      }`}
                    >
                      {s.severity}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.scope}</span>
                    {s.asset && (
                      <span className="text-xs font-medium">{s.asset}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {relativeTime(s.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-sm">{headline}</div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {s.summary}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {s.suggestedAction && (
                      <span className="text-muted-foreground">
                        Acción: <span className="text-foreground">{s.suggestedAction}</span>
                      </span>
                    )}
                    {s.actionAmountEur != null && (
                      <span className="text-muted-foreground">
                        {s.actionAmountEur.toFixed(2)}€
                      </span>
                    )}
                    <span className={`ml-auto text-xs ${STATUS_COLORS[s.userStatus]}`}>
                      {s.analysisStatus === "claude_done" ? "✓ analizado" : s.analysisStatus}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
