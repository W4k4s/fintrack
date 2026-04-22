import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { parseHeadlineShort } from "./[id]/analysis";
import { SeverityBar } from "@/components/intel/severity-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-danger-soft text-danger border-danger/30",
  high: "bg-warn-soft text-warn border-warn/30",
  med: "bg-info-soft text-info border-info/30",
  low: "bg-elevated text-muted-foreground border-border",
};

const SCOPE_ICONS: Record<string, string> = {
  price_dip: "📉", price_surge: "📈", fg_regime: "😱", funding_anomaly: "💸",
  news: "📰", macro_event: "🏦", drift: "⚖️", tax_harvest: "🧾",
  rebalance: "🔄", dca_pending: "🔔", opportunity: "⭐",
  thesis_target_hit: "🎯", thesis_stop_hit: "🛑", thesis_near_stop: "⚠️",
  thesis_expired: "⏳", custom: "⚙️",
};

const STATUS_COLORS: Record<string, string> = {
  unread: "text-info",
  read: "text-muted-foreground",
  acted: "text-success",
  dismissed: "text-muted-foreground",
  snoozed: "text-info",
};

type FilterKey = "unread" | "noise" | "read" | "acted" | "dismissed" | "snoozed" | "all";
type Density = "comfy" | "compact";

const FILTER_TABS: { key: FilterKey; label: string; hint: string }[] = [
  { key: "unread", label: "Sin leer", hint: "Pendientes de revisar con acción implícita" },
  { key: "noise", label: "Ruido", hint: "News / macro con severity baja, sin acción implícita" },
  { key: "read", label: "Leídas", hint: "Vistas pero sin actuar" },
  { key: "acted", label: "Ejecutadas", hint: "Actuaste sobre ellas" },
  { key: "snoozed", label: "Snoozed", hint: "Pospuestas" },
  { key: "dismissed", label: "Ignoradas", hint: "Descartadas" },
  { key: "all", label: "Todas", hint: "Cualquier estado" },
];

const NOISE_SCOPES = new Set(["news", "macro_event"]);

function isNoise(sig: { userStatus: string; severity: string; scope: string }): boolean {
  return sig.userStatus === "unread" && sig.severity === "low" && NOISE_SCOPES.has(sig.scope);
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

function parseDensity(value: string | undefined): Density {
  return value === "compact" ? "compact" : "comfy";
}

function buildUrl(filter: FilterKey, density: Density): string {
  const params = new URLSearchParams();
  if (filter !== "unread") params.set("filter", filter);
  if (density !== "comfy") params.set("density", density);
  const q = params.toString();
  return q ? `/intel?${q}` : "/intel";
}

export default async function IntelPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; density?: string }>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.filter);
  const density = parseDensity(sp.density);

  const all = await db
    .select()
    .from(schema.intelSignals)
    .orderBy(desc(schema.intelSignals.createdAt))
    .limit(300);

  const counts: Record<FilterKey, number> = {
    unread: 0, noise: 0, read: 0, acted: 0, dismissed: 0, snoozed: 0, all: all.length,
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
    <div className="px-4 md:px-6 py-6 max-w-5xl mx-auto">
      <header className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Intel</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Señales detectadas por reglas + análisis Claude. Motor de alertas de la estrategia.
            </p>
          </div>
          <div className="flex gap-3 text-xs flex-wrap">
            <Link href="/intel/research" className="text-muted-foreground hover:text-foreground">🔬 Research →</Link>
            <Link href="/intel/news" className="text-muted-foreground hover:text-foreground">📰 Noticias →</Link>
            <Link href="/intel/metrics" className="text-muted-foreground hover:text-foreground">📊 Métricas →</Link>
          </div>
        </div>
      </header>

      <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <nav className="flex flex-wrap gap-1 border-b border-border flex-1">
          {FILTER_TABS.map((t) => {
            const active = filter === t.key;
            return (
              <Link
                key={t.key}
                href={buildUrl(t.key, density)}
                title={t.hint}
                className={`inline-flex items-center gap-2 px-3 py-2 -mb-px border-b-2 text-sm transition-colors ${
                  active
                    ? "border-info text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] px-1.5 h-5 rounded-full text-[10px] font-mono tabular-nums ${
                    active ? "bg-info-soft text-info" : "bg-elevated text-muted-foreground"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 p-0.5 rounded-md bg-elevated shrink-0" role="group" aria-label="Densidad">
          <Link
            href={buildUrl(filter, "comfy")}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              density === "comfy" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Vista cómoda"
          >Cómoda</Link>
          <Link
            href={buildUrl(filter, "compact")}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
              density === "compact" ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Vista compacta"
          >Compacta</Link>
        </div>
      </div>

      {signals.length === 0 && (
        <EmptyState
          icon={<Inbox className="w-5 h-5" />}
          title={filter === "unread" ? "Buzón vacío" : `Sin señales en "${FILTER_TABS.find((t) => t.key === filter)?.label}"`}
          description={filter === "unread" ? "Estás al día. Las próximas señales aparecerán aquí." : "Cambia de filtro para ver señales en otros estados."}
          action={filter === "unread" ? (
            <form action="/api/intel/tick" method="POST">
              <button
                formAction="/api/intel/tick?scope=all"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-info-soft text-info text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Disparar tick manual
              </button>
            </form>
          ) : undefined}
        />
      )}

      <div className={`flex flex-col ${density === "compact" ? "gap-1.5" : "gap-3"}`}>
        {signals.map((s) => {
          const headline = parseHeadlineShort(s.analysisText) ?? s.title;
          return (
            <Link
              key={s.id}
              href={`/intel/${s.id}?from=${filter}`}
              className={`group flex items-stretch gap-3 rounded-xl border border-border bg-card hover:bg-elevated/50 transition-colors ${
                density === "compact" ? "py-2 pr-3 pl-1" : "p-4 pl-2"
              } ${s.userStatus === "unread" ? "ring-1 ring-info/30" : ""}`}
            >
              <SeverityBar severity={s.severity} />
              <div className={`text-xl ${density === "compact" ? "self-center" : ""}`}>{SCOPE_ICONS[s.scope] || "•"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border tabular-nums ${SEVERITY_BADGE[s.severity]}`}>
                    {s.severity}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.scope}</span>
                  {s.asset && <span className="text-xs font-medium">{s.asset}</span>}
                  <span className="text-xs text-muted-foreground tabular-nums ml-auto">{relativeTime(s.createdAt)}</span>
                </div>
                <div className={`mt-1 font-medium text-sm ${density === "compact" ? "truncate" : ""}`}>{headline}</div>
                {density === "comfy" && (
                  <>
                    <div className="text-sm text-muted-foreground line-clamp-2">{s.summary}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {s.suggestedAction && (
                        <span className="text-muted-foreground">
                          Acción: <span className="text-foreground">{s.suggestedAction}</span>
                        </span>
                      )}
                      {s.actionAmountEur != null && (
                        <span className="text-muted-foreground tabular-nums">{s.actionAmountEur.toFixed(2)}€</span>
                      )}
                      <span className={`ml-auto text-xs ${STATUS_COLORS[s.userStatus]}`}>
                        {s.analysisStatus === "claude_done" ? "✓ analizado" : s.analysisStatus}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
