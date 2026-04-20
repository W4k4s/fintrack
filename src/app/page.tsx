"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/components/currency-provider";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, Tooltip,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowLeftRight, RefreshCw,
  Landmark, Coins, Radar, Target, ArrowUpRight,
} from "lucide-react";
import { AssetIcon } from "@/components/asset-icon";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)",
];

type Asset = { symbol: string; amount: number; value: number; price?: number | null };
type Snapshot = { id: number; totalValue: number; date: string };
type IntelSignal = {
  id: number;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  scope: string;
  asset?: string;
  createdAt?: string;
};
type ScheduleResponse = {
  currentWeek: number;
  totalWeeks: number;
  weeklyBudget: number;
  thisWeekExecuted: number;
  thisWeekRemaining: number;
  fgValue: number;
  fgMultiplier: number;
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card border border-border rounded-xl", className)}>{children}</div>
  );
}

function DeltaPill({ pct, label }: { pct: number; label: string }) {
  const up = pct >= 0;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
        up ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      <span className="font-mono">
        {up ? "+" : ""}{pct.toFixed(2)}%
      </span>
      <span className="text-muted-foreground font-sans text-[10px] uppercase tracking-wider">{label}</span>
    </div>
  );
}

function Sparkline({ data }: { data: { v: number }[] }) {
  if (data.length < 2) return null;
  const first = data[0].v;
  const last = data[data.length - 1].v;
  const up = last >= first;
  const stroke = up ? "var(--success)" : "var(--danger)";
  return (
    <ResponsiveContainer width="100%" height={88}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.75} fill="url(#sparkFill)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function pctChange(a: number, b: number): number {
  if (!b) return 0;
  return ((a - b) / b) * 100;
}

function findClosestBeforeDays(snapshots: Snapshot[], days: number): Snapshot | null {
  if (!snapshots.length) return null;
  const now = Date.now();
  const target = now - days * 86_400_000;
  let closest: Snapshot | null = null;
  let best = Infinity;
  for (const s of snapshots) {
    const t = new Date(s.date).getTime();
    if (!Number.isFinite(t) || t > now) continue;
    const d = Math.abs(t - target);
    if (d < best) { best = d; closest = s; }
  }
  return closest;
}

function severityStyle(sev: IntelSignal["severity"]): string {
  if (sev === "critical" || sev === "high") return "bg-danger-soft text-danger";
  if (sev === "medium") return "bg-warn-soft text-warn";
  return "bg-info-soft text-info";
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const m = Math.round((Date.now() - then) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function Dashboard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [summary, setSummary] = useState<{ portfolio: number; banking: number; netWorth: number; portfolioAssets?: Asset[] } | null>(null);
  const [intelUnread, setIntelUnread] = useState<{ count: number; signals: IntelSignal[] }>({ count: 0, signals: [] });
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const { format, currency, setCurrency } = useCurrency();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [a, s, sum, intel, sched] = await Promise.all([
        fetch("/api/assets").then((r) => r.json()),
        fetch("/api/portfolio/snapshot").then((r) => r.json()),
        fetch("/api/dashboard/summary").then((r) => r.json()),
        fetch("/api/intel?status=unread&limit=100").then((r) => (r.ok ? r.json() : { signals: [], unreadCount: 0 })),
        fetch("/api/strategy/schedule").then((r) => (r.ok ? r.json() : null)),
      ]);
      setAssets(a.assets || []);
      setSnapshots(Array.isArray(s) ? s : []);
      setSummary(sum);
      setIntelUnread({ count: Number(intel.unreadCount || 0), signals: intel.signals || [] });
      setSchedule(sched);
    } finally {
      setLoading(false);
    }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/prices", { method: "POST" });
      const data = await res.json();
      if (data.success) await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(refreshPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const portfolioAssets = summary?.portfolioAssets || [];
  const totalValue = summary?.netWorth ?? assets.reduce((sum, a) => sum + (a.value || 0), 0);

  const { delta7, delta30 } = useMemo(() => {
    const last = snapshots[snapshots.length - 1]?.totalValue || totalValue;
    const s7 = findClosestBeforeDays(snapshots, 7);
    const s30 = findClosestBeforeDays(snapshots, 30);
    return {
      delta7: s7 ? pctChange(last, s7.totalValue) : 0,
      delta30: s30 ? pctChange(last, s30.totalValue) : 0,
    };
  }, [snapshots, totalValue]);

  const [range, setRange] = useState<"7d" | "30d" | "90d" | "1y" | "all">("30d");
  const { sparkData, rangeDelta, rangeLabel } = useMemo(() => {
    const RANGE_DAYS: Record<typeof range, number | null> = {
      "7d": 7, "30d": 30, "90d": 90, "1y": 365, "all": null,
    };
    const LABEL: Record<typeof range, string> = {
      "7d": "7-Day Performance",
      "30d": "30-Day Performance",
      "90d": "90-Day Performance",
      "1y": "1-Year Performance",
      "all": "All-Time Performance",
    };
    const days = RANGE_DAYS[range];
    const filtered = days == null
      ? snapshots
      : (() => {
          const cutoff = Date.now() - days * 86_400_000;
          return snapshots.filter((s) => new Date(s.date).getTime() >= cutoff);
        })();
    const spark = filtered.map((s) => ({ v: s.totalValue }));
    const delta = spark.length >= 2 ? pctChange(spark[spark.length - 1].v, spark[0].v) : 0;
    return { sparkData: spark, rangeDelta: delta, rangeLabel: LABEL[range] };
  }, [snapshots, range]);

  const severityBreakdown = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const s of intelUnread.signals) counts[s.severity] = (counts[s.severity] || 0) + 1;
    return counts;
  }, [intelUnread]);

  return (
    <div className="space-y-6">
      {/* ───────────────────────── HERO ───────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 md:gap-5 pt-2">
        {/* Net Worth card */}
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-overline">Net Worth</div>
              <div className="mt-2 text-3xl md:text-4xl font-semibold font-mono tabular-nums tracking-tight text-foreground">
                {format(totalValue)}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <DeltaPill pct={delta7} label="7D" />
                <DeltaPill pct={delta30} label="30D" />
              </div>
              <div className="text-xs text-muted-foreground mt-2">All accounts combined</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setCurrency(currency === "USD" ? "EUR" : "USD")}
                className="inline-flex items-center gap-1 h-8 px-2.5 text-[11px] font-medium bg-elevated hover:bg-[var(--hover-bg)] border border-border rounded-md transition-colors"
                title="Toggle currency"
              >
                <span className={cn("font-mono", currency === "USD" ? "text-accent" : "text-muted-foreground")}>$</span>
                <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                <span className={cn("font-mono", currency === "EUR" ? "text-accent" : "text-muted-foreground")}>€</span>
              </button>
              <button
                onClick={refreshPrices}
                disabled={refreshing}
                aria-label="Refresh prices"
                title="Refresh"
                className="inline-flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)] border border-border rounded-md transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              </button>
            </div>
          </div>
        </Card>

        {/* Performance card (with range selector) */}
        <Card className="p-5 md:p-6 flex flex-col">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-overline">{rangeLabel}</div>
            <div className="inline-flex items-center rounded-md border border-border bg-elevated p-0.5 text-[10px] font-mono">
              {(["7d", "30d", "90d", "1y", "all"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-2 py-1 rounded uppercase tracking-wider transition-colors",
                    range === r
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full",
              rangeDelta >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}>
              {rangeDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {rangeDelta >= 0 ? "+" : ""}{rangeDelta.toFixed(2)}%
            </span>
            {sparkData.length >= 2 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{format(sparkData[0].v)}</span>
                {" → "}
                <span className="font-mono text-foreground">{format(sparkData[sparkData.length - 1].v)}</span>
              </span>
            )}
            {sparkData.length < 2 && (
              <span className="text-xs text-muted-foreground">Not enough data</span>
            )}
          </div>
          <div className="flex-1 mt-3 min-h-[96px]">
            {sparkData.length >= 2 ? <Sparkline data={sparkData} /> : null}
          </div>
        </Card>
      </section>

      {/* ───────────────────────── 3 TILES ───────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="text-overline">Portfolio</div>
            <div className="w-8 h-8 rounded-lg bg-success-soft flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
          </div>
          <div className="text-2xl font-semibold mt-2 font-mono tracking-tight">{format(summary?.portfolio || 0)}</div>
          <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
            <span>{assets.length} assets</span>
            <span className={cn("font-mono", delta7 >= 0 ? "text-success" : "text-danger")}>
              {delta7 >= 0 ? "+" : ""}{delta7.toFixed(2)}% 7D
            </span>
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="text-overline">Banking</div>
            <div className="w-8 h-8 rounded-lg bg-warn-soft flex items-center justify-center">
              <Landmark className="w-4 h-4 text-warn" />
            </div>
          </div>
          <div className="text-2xl font-semibold mt-2 font-mono tracking-tight">{format(summary?.banking || 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">Cash in bank accounts</div>
        </Card>

        <Link
          href="/intel"
          className="group relative p-4 md:p-5 bg-card border border-border rounded-xl hover:border-border-strong transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="text-overline">Intel</div>
            <div className="w-8 h-8 rounded-lg bg-info-soft flex items-center justify-center">
              <Radar className="w-4 h-4 text-info" />
            </div>
          </div>
          <div className="text-2xl font-semibold mt-2 font-mono tracking-tight">
            {intelUnread.count}
            <span className="text-xs text-muted-foreground font-sans ml-2 font-normal">unread</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] font-mono">
            {severityBreakdown.critical + severityBreakdown.high > 0 && (
              <span className="text-danger">{severityBreakdown.critical + severityBreakdown.high}H</span>
            )}
            {severityBreakdown.medium > 0 && <span className="text-warn">{severityBreakdown.medium}M</span>}
            {severityBreakdown.low > 0 && <span className="text-info">{severityBreakdown.low}L</span>}
            {intelUnread.count === 0 && <span className="text-muted-foreground">All read</span>}
          </div>
          <ArrowUpRight className="absolute top-4 right-4 w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </section>

      {/* ───────────────── NEXT DCA · RECENT INTEL ──────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Next DCA */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">This week DCA</h2>
            </div>
            <Link href="/strategy" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Open <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {schedule ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-mono tracking-tight">{format(schedule.thisWeekExecuted)}</span>
                <span className="text-sm text-muted-foreground font-mono">/ {format(schedule.weeklyBudget)}</span>
              </div>
              <div className="mt-2 h-1.5 bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all"
                  style={{ width: `${Math.min(100, (schedule.thisWeekExecuted / Math.max(schedule.weeklyBudget, 1)) * 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Week</div>
                  <div className="text-sm font-mono mt-0.5">
                    {schedule.currentWeek} <span className="text-muted-foreground">/ {schedule.totalWeeks}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fear &amp; Greed</div>
                  <div className="text-sm font-mono mt-0.5">
                    {schedule.fgValue}
                    <span className={cn(
                      "ml-1 text-[10px]",
                      schedule.fgValue < 30 ? "text-success" : schedule.fgValue > 70 ? "text-danger" : "text-warn",
                    )}>
                      {schedule.fgValue < 25 ? "Extreme fear" : schedule.fgValue < 45 ? "Fear" : schedule.fgValue < 55 ? "Neutral" : schedule.fgValue < 75 ? "Greed" : "Extreme greed"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Multiplier</div>
                  <div className="text-sm font-mono mt-0.5">
                    <span className={cn(
                      schedule.fgMultiplier > 1 ? "text-success" : schedule.fgMultiplier < 1 ? "text-danger" : "",
                    )}>
                      {schedule.fgMultiplier.toFixed(2)}×
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No strategy configured.</div>
          )}
        </Card>

        {/* Recent Intel */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Recent Intel</h2>
            </div>
            <Link href="/intel" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All {intelUnread.count > 0 && `(${intelUnread.count})`} <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {intelUnread.signals.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">All caught up.</div>
          ) : (
            <ul className="space-y-1 -mx-2">
              {intelUnread.signals.slice(0, 3).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/intel/${s.id}`}
                    className="flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    <span className={cn(
                      "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                      severityStyle(s.severity),
                    )}>
                      {s.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug line-clamp-2">{s.title}</div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                        <span>{s.scope}</span>
                        {s.asset && <span>· {s.asset}</span>}
                        {s.createdAt && <span>· {relativeTime(s.createdAt)}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ───────────────────── PORTFOLIO ALLOCATION ────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-tight">Portfolio Allocation</h2>
          <div className="text-xs text-muted-foreground font-mono">{portfolioAssets.length} assets</div>
        </div>
        {portfolioAssets.length > 0 ? (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="relative flex-shrink-0">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={portfolioAssets.slice(0, 8)}
                    dataKey="value"
                    nameKey="symbol"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    innerRadius={72}
                    paddingAngle={2}
                    cornerRadius={4}
                    animationBegin={0}
                    animationDuration={900}
                    animationEasing="ease-out"
                    stroke="none"
                    onMouseEnter={(_: unknown, i: number) => setHoveredSlice(i)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  >
                    {portfolioAssets.slice(0, 8).map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        style={{
                          filter: hoveredSlice === i ? "brightness(1.1)" : "none",
                          transition: "all 0.18s var(--ease-standard)",
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => format(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Portfolio</span>
                <span className="text-base font-mono font-semibold">{format(summary?.portfolio || 0)}</span>
              </div>
            </div>
            <div className="flex-1 w-full grid grid-cols-2 gap-x-6 gap-y-2">
              {portfolioAssets.slice(0, 8).map((a, i) => {
                const portfolioTotal = summary?.portfolio || totalValue;
                const pct = portfolioTotal > 0 ? (a.value / portfolioTotal) * 100 : 0;
                return (
                  <Link
                    key={a.symbol}
                    href={`/assets/${encodeURIComponent(a.symbol)}`}
                    onMouseEnter={() => setHoveredSlice(i)}
                    onMouseLeave={() => setHoveredSlice(null)}
                    className="flex items-center gap-2.5 group cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-sm font-medium min-w-0 truncate">{a.symbol}</span>
                    <span className="ml-auto text-xs text-muted-foreground font-mono tabular-nums">{pct.toFixed(1)}%</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No assets yet</div>
        )}
      </Card>

      {/* ───────────────────── TOP HOLDINGS GRID ────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold tracking-tight">Top Holdings</h2>
          <Link href="/assets" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            All <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        {portfolioAssets.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {portfolioAssets.slice(0, 8).map((a, i) => {
              const portfolioTotal = summary?.portfolio || totalValue;
              const pct = portfolioTotal > 0 ? (a.value / portfolioTotal) * 100 : 0;
              const color = CHART_COLORS[i % CHART_COLORS.length];
              return (
                <Link
                  key={a.symbol}
                  href={`/assets/${encodeURIComponent(a.symbol)}`}
                  className="group relative bg-card border border-border rounded-xl p-4 hover:border-border-strong transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AssetIcon symbol={a.symbol} size={22} />
                      <span className="font-medium text-sm truncate">{a.symbol}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-3 text-lg font-mono tabular-nums tracking-tight">{format(a.value)}</div>
                  <div className="text-[11px] text-muted-foreground font-mono tabular-nums mt-0.5 truncate">
                    {a.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {a.symbol}
                  </div>
                  <div className="mt-3 h-1 bg-border/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <ArrowUpRight className="absolute top-3 right-3 w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="p-5 text-sm text-muted-foreground">Connect an exchange to see your holdings.</Card>
        )}
      </section>

      {loading && (
        <div className="text-center text-xs text-muted-foreground font-mono">Loading…</div>
      )}

      <div className="pb-4">
        <div className="flex items-center gap-2">
          <Coins className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Information, not financial advice
          </span>
        </div>
      </div>
    </div>
  );
}
