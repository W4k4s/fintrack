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

type FilterKey = "unread" | "noise" | "read" | "acted" | "dismissed" | "snoozed" | "all";

const FILTER_TABS: { key: FilterKey; label: string; hint: string }[] = [
  { key: "unread", label: "Sin leer", hint: "Pendientes de revisar con acción implícita" },
  { key: "noise", label: "Ruido", hint: "News / macro con severity baja, sin acción implícita" },
  { key: "read", label: "Leídas", hint: "Vistas pero sin actuar" },
  { key: "acted", label: "Ejecutadas", hint: "Actuaste sobre ellas" },
  { key: "snoozed", label: "Snoozed", hint: "Pospuestas" },
  { key: "dismissed", label: "Ignoradas", hint: "Descartadas" },
  { key: "all", label: "Todas", hint: "Cualquier estado" },
];

// Scopes that are purely informational — no implicit action on the user.
// Low-severity signals in these scopes go to "Ruido". Low-severity signals in
// actionable scopes (dca_pending, drift, rebalance, tax_harvest, price_dip…)
// stay in "Sin leer" because they carry an implicit TODO regardless of severity.
const NOISE_SCOPES = new Set(["news", "macro_event"]);

function isNoise(sig: { userStatus: string; severity: string; scope: string }): boolean {
  return (
    sig.userStatus === "unread" && sig.severity === "low" && NOISE_SCOPES.has(sig.scope)
  );
}

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

function parseFilter(value: string | undefined): FilterKey {
  if (!value) return "unread";
  const v = value as FilterKey;
  return FILTER_TABS.some((t) => t.key === v) ? v : "unread";
}

export default async function IntelPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.filter);

  const all = await db
    .select()
    .from(schema.intelSignals)
    .orderBy(desc(schema.intelSignals.createdAt))
    .limit(300);

  const counts: Record<FilterKey, number> = {
    unread: 0,
    noise: 0,
    read: 0,
    acted: 0,
    dismissed: 0,
    snoozed: 0,
    all: all.length,
  };
  for (const s of all) {
    if (s.userStatus === "unread") {
      if (isNoise(s)) counts.noise++;
      else counts.unread++;
    } else if (s.userStatus in counts) {
      counts[s.userStatus as FilterKey]++;
    }
  }

  const signals = all.filter((s) => {
    if (filter === "all") return true;
    if (filter === "unread") return s.userStatus === "unread" && !isNoise(s);
    if (filter === "noise") return isNoise(s);
    return s.userStatus === filter;
  });

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <header className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Intel</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Señales detectadas por reglas + análisis Claude. Motor de alertas de la estrategia.
            </p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/intel/research"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              🔬 Research drawer →
            </Link>
            <Link
              href="/intel/news"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              📰 Noticias procesadas →
            </Link>
            <Link
              href="/intel/metrics"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              📊 Métricas por scope →
            </Link>
          </div>
        </div>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1.5 border-b border-border">
        {FILTER_TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "unread" ? "/intel" : `/intel?filter=${t.key}`}
              title={t.hint}
              className={`inline-flex items-center gap-2 px-3 py-2 -mb-px border-b-2 text-sm transition-colors ${
                active
                  ? "border-accent text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`inline-flex items-center justify-center min-w-[20px] px-1.5 h-5 rounded-full text-[10px] font-mono ${
                  active ? "bg-accent/15 text-accent" : "bg-elevated text-muted-foreground"
                }`}
              >
                {counts[t.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {signals.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-2">{filter === "unread" ? "🟢" : "📭"}</div>
          <div className="text-sm text-muted-foreground">
            {filter === "unread"
              ? "Buzón vacío. Estás al día."
              : `Sin señales en "${FILTER_TABS.find((t) => t.key === filter)?.label}".`}
          </div>
          {filter === "unread" && (
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
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {signals.map((s) => {
          const headline = parseHeadlineShort(s.analysisText) ?? s.title;
          return (
            <Link
              key={s.id}
              href={`/intel/${s.id}?from=${filter}`}
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
                    {s.asset && <span className="text-xs font-medium">{s.asset}</span>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {relativeTime(s.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-sm">{headline}</div>
                  <div className="text-sm text-muted-foreground line-clamp-2">{s.summary}</div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {s.suggestedAction && (
                      <span className="text-muted-foreground">
                        Acción: <span className="text-foreground">{s.suggestedAction}</span>
                      </span>
                    )}
                    {s.actionAmountEur != null && (
                      <span className="text-muted-foreground">{s.actionAmountEur.toFixed(2)}€</span>
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
