"use client";

import { useEffect, useState } from "react";
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
  useEffect(() => { fetchData(); }, []);

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
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, color: "#fafafa" }} formatter={(v: any) => format(v)} />
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
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={assets.slice(0, 8)} dataKey="value" nameKey="symbol" cx="50%" cy="50%" outerRadius={100} innerRadius={60}
                  label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {assets.slice(0, 8).map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, color: "#fafafa" }} formatter={(v: any) => format(v)} />
              </PieChart>
            </ResponsiveContainer>
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
                  <tr key={a.symbol} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
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
