import Link from "next/link";
import { BarChart3 } from "lucide-react";
import {
  computeIntelMetrics,
  COOLDOWN_CONFIG,
  IGNORED_AFTER_DAYS,
  type ScopeMetrics,
} from "@/lib/intel/metrics";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const SCOPE_ICONS: Record<string, string> = {
  price_dip: "📉", price_surge: "📈", fg_regime: "😱", funding_anomaly: "💸",
  news: "📰", macro_event: "🏦", drift: "⚖️", tax_harvest: "🧾",
  rebalance: "🔄", dca_pending: "🔔", profile_review: "🧭",
  concentration_risk: "🎯", correlation_risk: "🔗",
  opportunity: "⭐", thesis_target_hit: "🎯", thesis_stop_hit: "🛑",
  thesis_near_stop: "⚠️", thesis_expired: "⏳", custom: "⚙️",
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

function heatmapCell(rate: number, total: number): string {
  if (total === 0) return "bg-elevated text-muted-foreground";
  if (rate >= 0.7) return "bg-success text-success-foreground";
  if (rate >= 0.5) return "bg-success/80 text-success-foreground";
  if (rate >= 0.3) return "bg-warn/80 text-warn-foreground";
  if (rate >= 0.1) return "bg-danger/80 text-danger-foreground";
  return "bg-elevated text-muted-foreground";
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

  const sortedByActed = [...snap.scopes].sort((a, b) => b.actedRate - a.actedRate);
  const maxTotal = Math.max(...snap.scopes.map((s) => s.total), 1);

  const scopesWithExec = snap.scopes.filter(
    (s) => s.executionStats && s.executionStats.executedAmountEur > 0,
  );
  const maxExecuted = Math.max(
    ...scopesWithExec.map((s) => s.executionStats!.executedAmountEur),
    1,
  );

  return (
    <div className="px-4 md:px-6 py-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Intel · Métricas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rendimiento por scope en los últimos {windowDays} días. Scopes con dismiss &gt;
              {" "}{pct(COOLDOWN_CONFIG.dismissThreshold)} entran en cooldown {COOLDOWN_CONFIG.durationDays}d.
              &quot;Ruido&quot; = signals sin resolver &ge;{IGNORED_AFTER_DAYS}d.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`/intel/metrics?windowDays=${d}`}
                className={`px-3 py-1 rounded-md border tabular-nums ${
                  d === windowDays
                    ? "border-info text-info bg-info-soft"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3 flex gap-4 text-xs">
          <Link href="/intel" className="text-muted-foreground hover:text-foreground">← Intel</Link>
          <span className="text-muted-foreground">
            Total signals ventana: <span className="font-semibold text-foreground tabular-nums">{snap.totalSignals}</span>
          </span>
        </div>
      </header>

      {snap.scopes.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-5 h-5" />}
          title={`Sin señales en los últimos ${windowDays} días`}
          description="Amplía la ventana o espera a que el tick detecte nuevas señales."
        />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Hit-rate por scope
            </h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 gap-y-2 text-xs items-center">
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Scope</div>
                <div className="text-[10px] uppercase text-muted-foreground font-semibold">Volumen</div>
                <div className="text-[10px] uppercase text-muted-foreground font-semibold text-center px-2">Acted</div>
                <div className="text-[10px] uppercase text-muted-foreground font-semibold text-center px-2">Dismiss</div>
                <div className="text-[10px] uppercase text-muted-foreground font-semibold text-center px-2">Ruido</div>
                {sortedByActed.map((m) => (
                  <ScopeHeatRow key={m.scope} m={m} maxTotal={maxTotal} />
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                <span>Leyenda:</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-success" /> ≥70%</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-success/80" /> 50–70</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-warn/80" /> 30–50</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger/80" /> 10–30</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-elevated" /> &lt;10%</span>
              </div>
            </div>
          </section>

          {scopesWithExec.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                ROI por scope — € ejecutado
              </h2>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="space-y-2">
                  {scopesWithExec.map((s) => {
                    const stats = s.executionStats!;
                    const pct = (stats.executedAmountEur / maxExecuted) * 100;
                    return (
                      <div key={s.scope} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          <span>{SCOPE_ICONS[s.scope] ?? "•"}</span>
                          <span className="font-mono text-[11px] truncate">{s.scope}</span>
                        </div>
                        <div className="relative h-5 bg-elevated rounded-md overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-success/60 to-success rounded-md transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="absolute inset-0 flex items-center px-2 text-[10px] text-foreground font-medium tabular-nums">
                            {formatEur(stats.executedAmountEur)} <span className="text-muted-foreground ml-1">/ {formatEur(stats.plannedAmountEur)}</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums w-14 text-right">
                          {(stats.executionRate * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Desglose completo
            </h2>
            <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-elevated text-xs uppercase tracking-wide text-foreground/80">
                  <tr>
                    <th className="text-left px-4 py-3">Scope</th>
                    <th className="text-right px-3 py-3">Total</th>
                    <th className="text-right px-3 py-3">Crit / High</th>
                    <th className="text-right px-3 py-3">Med / Low</th>
                    <th className="text-right px-3 py-3">Acted</th>
                    <th className="text-right px-3 py-3" title="Acted rate por severity: crit+high / med+low">Acted H/L</th>
                    <th className="text-right px-3 py-3">Dismiss</th>
                    <th className="text-right px-3 py-3" title={`Signals unread/read sin resolver tras ${IGNORED_AFTER_DAYS}d`}>Ruido</th>
                    <th className="text-right px-3 py-3" title="Mediana createdAt → resolvedAt para signals acted">Time→act</th>
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
                      <tr key={m.scope} className="border-t border-border/50 hover:bg-elevated/30">
                        <td className="px-4 py-3">
                          <span className="mr-2">{icon}</span>
                          <span className="font-mono text-xs">{m.scope}</span>
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums">{m.total}</td>
                        <td className="text-right px-3 py-3 tabular-nums text-xs">
                          <span className="text-danger">{m.bySeverity.critical}</span>
                          {" / "}
                          <span className="text-warn">{m.bySeverity.high}</span>
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                          {m.bySeverity.med} / {m.bySeverity.low}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums text-success">{pct(m.actedRate)}</td>
                        <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                          <span className="text-success">{pct(m.actedRateHighSeverity)}</span>
                          {" / "}
                          <span>{pct(m.actedRateLowSeverity)}</span>
                        </td>
                        <td className={`text-right px-3 py-3 tabular-nums ${isHighDismiss ? "text-danger font-semibold" : "text-muted-foreground"}`}>
                          {pct(m.dismissedRate)}
                        </td>
                        <td className={`text-right px-3 py-3 tabular-nums ${isHighIgnored ? "text-warn font-semibold" : "text-muted-foreground"}`}>
                          {pct(m.ignoredRate)}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">{formatHours(m.timeToActionMedianHours)}</td>
                        <td className="text-right px-3 py-3 tabular-nums text-xs text-muted-foreground">
                          {m.notificationsSent} / {m.notificationsSuppressed}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {m.activeCooldown ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-info-soft text-info border border-info/30">
                              🧊 cooldown {relativeUntil(m.activeCooldown.until)}
                            </span>
                          ) : isHighDismiss ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-warn-soft text-warn border border-warn/30">
                              ⚠️ dismiss alto
                            </span>
                          ) : isHighIgnored ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-warn-soft text-warn border border-warn/30">
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
          </section>
        </>
      )}

      {exec && exec.ordersTotal > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Ejecución plan rebalance</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Estado de las órdenes generadas por signals scope=drift en la ventana. Execution rate excluye superseded.
          </p>
          <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Órdenes total" value={String(exec.ordersTotal)} />
            <Stat label="Execution rate" value={pct(exec.executionRate)} accent="success" />
            <Stat label="Ejecutado €" value={formatEur(exec.executedAmountEur)} accent="success" />
            <Stat label="Planeado €" value={formatEur(exec.plannedAmountEur)} />
            <Stat label="Executed" value={String(exec.ordersExecuted)} accent="success" />
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

function ScopeHeatRow({ m, maxTotal }: { m: ScopeMetrics; maxTotal: number }) {
  const volPct = (m.total / maxTotal) * 100;
  return (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        <span>{SCOPE_ICONS[m.scope] ?? "•"}</span>
        <span className="font-mono text-[11px] truncate">{m.scope}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 h-4 bg-elevated rounded-md overflow-hidden min-w-[60px]">
          <div
            className="h-full bg-gradient-to-r from-info/50 to-info rounded-md"
            style={{ width: `${volPct}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{m.total}</span>
      </div>
      <div className={`px-2 py-1 rounded text-[10px] tabular-nums font-semibold text-center min-w-[44px] ${heatmapCell(m.actedRate, m.total)}`}>
        {pct(m.actedRate)}
      </div>
      <div className={`px-2 py-1 rounded text-[10px] tabular-nums text-center min-w-[44px] ${
        m.dismissedRate > 0.4 ? "bg-danger/80 text-danger-foreground font-semibold" : "bg-elevated text-muted-foreground"
      }`}>
        {pct(m.dismissedRate)}
      </div>
      <div className={`px-2 py-1 rounded text-[10px] tabular-nums text-center min-w-[44px] ${
        m.ignoredRate >= 0.5 ? "bg-warn/80 text-warn-foreground font-semibold" : "bg-elevated text-muted-foreground"
      }`}>
        {pct(m.ignoredRate)}
      </div>
    </>
  );
}

function Stat({
  label, value, accent,
}: {
  label: string; value: string;
  accent?: "success" | "muted";
}) {
  const color =
    accent === "success" ? "text-success" :
    accent === "muted" ? "text-muted-foreground" :
    "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
    </div>
  );
}
