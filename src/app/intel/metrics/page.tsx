import Link from "next/link";
import {
  computeIntelMetrics,
  COOLDOWN_CONFIG,
  IGNORED_AFTER_DAYS,
  type ScopeMetrics,
} from "@/lib/intel/metrics";

export const dynamic = "force-dynamic";

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
  profile_review: "🧭",
  custom: "⚙️",
};

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatEur(v: number): string {
  return `${v.toFixed(0)}€`;
}

function relativeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expirado";
  const h = Math.floor(diff / 3600_000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function highDismiss(m: ScopeMetrics): boolean {
  return m.total >= COOLDOWN_CONFIG.minSamples && m.dismissedRate > COOLDOWN_CONFIG.dismissThreshold;
}

function highIgnored(m: ScopeMetrics): boolean {
  return m.total >= COOLDOWN_CONFIG.minSamples && m.ignoredRate >= 0.5;
}

export default async function IntelMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ windowDays?: string }>;
}) {
  const params = await searchParams;
  const windowDays = Math.min(90, Math.max(1, Number(params.windowDays ?? 30)));
  const snap = await computeIntelMetrics(windowDays);
  const driftScope = snap.scopes.find((s) => s.scope === "drift");
  const exec = driftScope?.executionStats;

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Intel · Métricas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rendimiento por scope en los últimos {windowDays} días. Scopes con dismiss &gt;
              {pct(COOLDOWN_CONFIG.dismissThreshold)} entran en cooldown automático {COOLDOWN_CONFIG.durationDays}d. &quot;Ruido&quot; = signals
              sin resolver &ge;{IGNORED_AFTER_DAYS}d.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`/intel/metrics?windowDays=${d}`}
                className={`px-3 py-1 rounded-md border ${
                  d === windowDays
                    ? "border-accent text-accent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3 flex gap-4 text-xs">
          <Link href="/intel" className="text-muted-foreground hover:text-foreground">
            ← Volver a Intel
          </Link>
          <span className="text-muted-foreground">
            Total signals ventana: <span className="font-semibold">{snap.totalSignals}</span>
          </span>
        </div>
      </header>

      {snap.scopes.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-2">🟢</div>
          <div className="text-sm text-muted-foreground">
            Sin señales en los últimos {windowDays} días.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Scope</th>
                <th className="text-right px-3 py-3">Total</th>
                <th className="text-right px-3 py-3">Crit / High</th>
                <th className="text-right px-3 py-3">Med / Low</th>
                <th className="text-right px-3 py-3" title="Acted rate global">Acted</th>
                <th
                  className="text-right px-3 py-3"
                  title="Acted rate por severity: crit+high / med+low"
                >
                  Acted H/L
                </th>
                <th className="text-right px-3 py-3">Dismiss</th>
                <th
                  className="text-right px-3 py-3"
                  title={`Signals unread/read sin resolver tras ${IGNORED_AFTER_DAYS}d`}
                >
                  Ruido
                </th>
                <th
                  className="text-right px-3 py-3"
                  title="Mediana createdAt → resolvedAt para signals acted"
                >
                  Time→act
                </th>
                <th className="text-right px-3 py-3">TG s/s</th>
                <th className="text-left px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {snap.scopes.map((m) => {
                const icon = SCOPE_ICONS[m.scope] ?? "•";
                const isHighDismiss = highDismiss(m);
                const isHighIgnored = highIgnored(m);
                return (
                  <tr
                    key={m.scope}
                    className="border-t border-border/50 hover:bg-muted/10"
                  >
                    <td className="px-4 py-3">
                      <span className="mr-2">{icon}</span>
                      <span className="font-mono text-xs">{m.scope}</span>
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums">{m.total}</td>
                    <td className="text-right px-3 py-3 tabular-nums text-xs">
                      <span className="text-red-400">{m.bySeverity.critical}</span>
                      {" / "}
                      <span className="text-orange-400">{m.bySeverity.high}</span>
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                      {m.bySeverity.med} / {m.bySeverity.low}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums text-green-400">
                      {pct(m.actedRate)}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                      <span className="text-green-400">{pct(m.actedRateHighSeverity)}</span>
                      {" / "}
                      <span>{pct(m.actedRateLowSeverity)}</span>
                    </td>
                    <td
                      className={`text-right px-3 py-3 tabular-nums ${
                        isHighDismiss ? "text-red-400 font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {pct(m.dismissedRate)}
                    </td>
                    <td
                      className={`text-right px-3 py-3 tabular-nums ${
                        isHighIgnored ? "text-yellow-400 font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {pct(m.ignoredRate)}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                      {formatHours(m.timeToActionMedianHours)}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                      {m.notificationsSent} / {m.notificationsSuppressed}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {m.activeCooldown ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          🧊 cooldown {relativeUntil(m.activeCooldown.until)}
                        </span>
                      ) : isHighDismiss ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                          ⚠️ dismiss alto
                        </span>
                      ) : isHighIgnored ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                          🔕 ignorado
                        </span>
                      ) : (
                        <span className="text-muted-foreground">ok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {exec && exec.ordersTotal > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Ejecución plan rebalance</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Estado de las órdenes generadas por signals scope=drift en la ventana. Execution rate excluye superseded.
          </p>
          <div className="rounded-xl border border-border p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Órdenes total" value={String(exec.ordersTotal)} />
            <Stat label="Execution rate" value={pct(exec.executionRate)} accent="green" />
            <Stat label="Ejecutado €" value={formatEur(exec.executedAmountEur)} accent="green" />
            <Stat label="Planeado €" value={formatEur(exec.plannedAmountEur)} />
            <Stat label="Executed" value={String(exec.ordersExecuted)} accent="green" />
            <Stat label="Pending" value={String(exec.ordersPending)} accent="muted" />
            <Stat label="Dismissed" value={String(exec.ordersDismissed)} accent="muted" />
            <Stat label="Stale" value={String(exec.ordersStale)} accent="muted" />
            <Stat label="Superseded" value={String(exec.ordersSuperseded)} accent="muted" />
            <Stat label="Needs pick" value={String(exec.ordersNeedsPick)} accent="muted" />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "muted";
}) {
  const color =
    accent === "green"
      ? "text-green-400"
      : accent === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
    </div>
  );
}
