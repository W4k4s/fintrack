"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/components/currency-provider";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight, RefreshCw, Coins } from "lucide-react";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

export default function Dashboard() {
  const [assets, setAssets] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
  const { format, convert, currency, setCurrency } = useCurrency();

  const fetchData = async () => {
    setLoading(true);
    const [a, s, e] = await Promise.all([
      fetch("/api/assets").then(r => r.json()),
      fetch("/api/portfolio/snapshot").then(r => r.json()),
      fetch("/api/exchanges").then(r => r.json()),
    ]);
    setAssets(a.assets || []); setSnapshots(s || []); setExchanges(e || []);
    setLoading(false);
  };
  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/prices", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLastPriceUpdate(data.timestamp);
        await fetchData(); // reload with new prices
      }
    } catch {} finally { setRefreshing(false); }
  };

  useEffect(() => {
    // Initial load + price refresh
    fetchData().then(() => refreshPrices());
    // Auto-refresh every 5 minutes
    const interval = setInterval(refreshPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const totalValue = assets.reduce((sum: number, a: any) => sum + (a.value || 0), 0);
  const prevValue = snapshots.length > 1 ? snapshots[snapshots.length - 2]?.totalValue : totalValue;
  const change = prevValue ? ((totalValue - prevValue) / prevValue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Your portfolio at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrency(currency === "USD" ? "EUR" : "USD")}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors"
          >
            <span className={currency === "USD" ? "text-accent" : "text-muted"}>$</span>
            <ArrowLeftRight className="w-3.5 h-3.5 text-muted" />
            <span className={currency === "EUR" ? "text-accent" : "text-muted"}>€</span>
          </button>
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 text-sm bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Total Portfolio</span>
            <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center"><Wallet className="w-5 h-5 text-accent" /></div>
          </div>
          <div className="text-2xl font-bold mt-2">{format(totalValue)}</div>
          <div className={`flex items-center gap-1 text-sm mt-1 ${change >= 0 ? "text-accent" : "text-destructive"}`}>
            {change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Assets</span>
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center"><Coins className="w-5 h-5 text-blue-500" /></div>
          </div>
          <div className="text-2xl font-bold mt-2">{assets.length}</div>
          <div className="text-sm text-muted mt-1">unique tokens</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Exchanges</span>
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center"><ArrowLeftRight className="w-5 h-5 text-purple-500" /></div>
          </div>
          <div className="text-2xl font-bold mt-2">{exchanges.length}</div>
          <div className="text-sm text-muted mt-1">connected</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Top Holding</span>
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-500" /></div>
          </div>
          <div className="text-2xl font-bold mt-2">{assets[0]?.symbol || "—"}</div>
          <div className="text-sm text-muted mt-1">{assets[0] ? format(assets[0].value) : "no data"}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Portfolio History</h2>
          {snapshots.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={snapshots}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => format(v)} />
                <Tooltip contentStyle={{ backgroundColor: "rgba(24, 24, 27, 0.95)", backdropFilter: "blur(8px)", border: "1px solid #3f3f46", borderRadius: 8, color: "#fafafa", padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }} formatter={(v: any) => format(v)}
                      itemStyle={{ color: "#fafafa" }}
                      labelStyle={{ color: "#a1a1aa" }} />
                <Line type="monotone" dataKey="totalValue" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex flex-col items-center justify-center text-muted gap-2">
              <TrendingUp className="w-8 h-8 text-muted-foreground" /><span>No data yet — connect an exchange to start tracking</span>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Allocation</h2>
          {assets.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="relative flex-shrink-0">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <defs>
                      {assets.slice(0, 8).map((_, i) => (
                        <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={1} />
                          <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={assets.slice(0, 8)}
                      dataKey="value"
                      nameKey="symbol"
                      cx="50%" cy="50%"
                      outerRadius={100}
                      innerRadius={70}
                      paddingAngle={2}
                      cornerRadius={4}
                      animationBegin={0}
                      animationDuration={1200}
                      animationEasing="ease-out"
                      stroke="none"
                      onMouseEnter={(_: any, i: number) => setHoveredSlice(i)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    >
                      {assets.slice(0, 8).map((_, i) => (
                        <Cell
                          key={i}
                          fill={`url(#grad-${i})`}
                          style={{
                            filter: hoveredSlice === i ? `drop-shadow(0 0 8px ${COLORS[i % COLORS.length]}80)` : "none",
                            transform: hoveredSlice === i ? "scale(1.05)" : "scale(1)",
                            transformOrigin: "center",
                            transition: "all 0.2s ease",
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(24, 24, 27, 0.95)", backdropFilter: "blur(8px)", border: "1px solid #3f3f46", borderRadius: 8, color: "#fafafa", padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
                      formatter={(v: any) => format(v)}
                      itemStyle={{ color: "#fafafa" }}
                      labelStyle={{ color: "#a1a1aa" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted uppercase tracking-wider">Total</span>
                  <span className="text-lg font-bold">{format(totalValue)}</span>
                </div>
              </div>
              <div className="flex-1 w-full space-y-2.5">
                {assets.slice(0, 8).map((a: any, i: number) => {
                  const pct = totalValue > 0 ? (a.value / totalValue) * 100 : 0;
                  return (
                    <div
                      key={a.symbol}
                      className="flex items-center gap-3 group cursor-pointer"
                      onClick={() => window.location.href = `/assets/${encodeURIComponent(a.symbol)}`} onMouseEnter={() => setHoveredSlice(i)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length], boxShadow: hoveredSlice === i ? `0 0 8px ${COLORS[i % COLORS.length]}80` : "none" }} />
                      <span className="text-sm font-medium w-14">{a.symbol}</span>
                      <div className="flex-1 h-2 bg-border/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}99)`,
                            boxShadow: hoveredSlice === i ? `0 0 6px ${COLORS[i % COLORS.length]}60` : "none",
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted w-10 text-right">{pct.toFixed(1)}%</span>
                      <span className="text-xs font-medium w-20 text-right">{format(a.value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-[260px] flex flex-col items-center justify-center text-muted gap-2">
              <Wallet className="w-8 h-8 text-muted-foreground" /><span>No assets yet</span>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="p-5 pb-3"><h2 className="text-base font-semibold">Top Holdings</h2></div>
        {assets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-muted text-xs uppercase tracking-wider border-t border-border">
                <th className="text-left py-3 px-5 font-medium">Asset</th>
                <th className="text-right py-3 px-5 font-medium">Amount</th>
                <th className="text-right py-3 px-5 font-medium">Value</th>
                <th className="text-right py-3 px-5 font-medium">Portfolio %</th>
              </tr></thead>
              <tbody>
                {assets.slice(0, 10).map((a: any, i: number) => (
                  <tr key={a.symbol} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors cursor-pointer" onClick={() => window.location.href = `/assets/${encodeURIComponent(a.symbol)}`}>
                    <td className="py-3 px-5"><div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="font-medium">{a.symbol}</span>
                    </div></td>
                    <td className="py-3 px-5 text-right text-muted">{a.total.toFixed(4)}</td>
                    <td className="py-3 px-5 text-right font-medium">{format(a.value)}</td>
                    <td className="py-3 px-5 text-right text-muted">{totalValue > 0 ? ((a.value / totalValue) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="px-5 pb-5 text-muted">Connect an exchange to see your holdings.</div>}
      </Card>
    </div>
  );
}
