"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight, RefreshCw } from "lucide-react";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function Dashboard() {
  const [assets, setAssets] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [a, s, e] = await Promise.all([
      fetch("/api/assets").then(r => r.json()),
      fetch("/api/portfolio/snapshot").then(r => r.json()),
      fetch("/api/exchanges").then(r => r.json()),
    ]);
    setAssets(a.assets || []);
    setSnapshots(s || []);
    setExchanges(e || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const totalValue = assets.reduce((sum: number, a: any) => sum + (a.value || 0), 0);
  const prevValue = snapshots.length > 1 ? snapshots[snapshots.length - 2]?.totalValue : totalValue;
  const change = prevValue ? ((totalValue - prevValue) / prevValue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <Wallet className="w-4 h-4" /> Total Portfolio
          </div>
          <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          <div className={`text-sm mt-1 ${change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3 inline mr-1" /> : <TrendingDown className="w-3 h-3 inline mr-1" />}
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-400 text-sm mb-1">Assets</div>
          <div className="text-2xl font-bold">{assets.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <ArrowLeftRight className="w-4 h-4" /> Exchanges
          </div>
          <div className="text-2xl font-bold">{exchanges.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-400 text-sm mb-1">Top Holding</div>
          <div className="text-2xl font-bold">{assets[0]?.symbol || "—"}</div>
          <div className="text-sm text-zinc-400">{assets[0] ? formatCurrency(assets[0].value) : ""}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4">Portfolio History</h2>
          {snapshots.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={snapshots}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Line type="monotone" dataKey="totalValue" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-zinc-500">
              No snapshot data yet. Connect an exchange to start tracking.
            </div>
          )}
        </div>

        {/* Allocation Pie */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4">Allocation</h2>
          {assets.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={assets.slice(0, 8)}
                  dataKey="value"
                  nameKey="symbol"
                  cx="50%" cy="50%"
                  outerRadius={100}
                  label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {assets.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-zinc-500">
              No assets yet.
            </div>
          )}
        </div>
      </div>

      {/* Top Holdings */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-4">Top Holdings</h2>
        {assets.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-800">
                <th className="text-left py-2">Asset</th>
                <th className="text-right py-2">Amount</th>
                <th className="text-right py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {assets.slice(0, 10).map((a: any) => (
                <tr key={a.symbol} className="border-b border-zinc-800/50">
                  <td className="py-2 font-medium">{a.symbol}</td>
                  <td className="py-2 text-right text-zinc-400">{a.total.toFixed(4)}</td>
                  <td className="py-2 text-right">{formatCurrency(a.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-zinc-500">Connect an exchange to see your holdings.</p>
        )}
      </div>
    </div>
  );
}
