"use client";

import { useEffect, useState } from "react";
import { useCurrency } from "@/components/currency-provider";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowUpDown, Filter,
} from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  transfer_in: "#10b981",
  transfer_out: "#ef4444",
  trade: "#3b82f6",
  interest: "#f59e0b",
  dividend: "#8b5cf6",
  card_payment: "#ec4899",
  gift: "#06b6d4",
  other: "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  transfer_in: "Transfers In",
  transfer_out: "Transfers Out",
  trade: "Trades",
  interest: "Interest",
  dividend: "Dividends",
  card_payment: "Card Payments",
  gift: "Gifts",
  other: "Other",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

export default function ExpensesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const { format } = useCurrency();

  // For EUR amounts, we format directly
  const fmtEur = (v: number) => `€${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    fetch("/api/expenses").then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div className="text-muted">Loading...</div>;
  if (!data || !data.transactions.length) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted mt-1">Your spending and income overview</p></div>
        <Card className="p-8 text-center">
          <Wallet className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="font-medium">No transactions yet</p>
          <p className="text-sm text-muted mt-1">Import your Trade Republic data to see your expenses</p>
          <a href="/import" className="inline-block mt-4 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90">Go to Import</a>
        </Card>
      </div>
    );
  }

  const { summary, transactions } = data;

  // Monthly chart data
  const monthlyData = Object.entries(summary.byMonth as Record<string, { income: number; expenses: number }>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({ month, income: vals.income, expenses: vals.expenses }));

  // Category breakdown
  const typeBreakdown = Object.entries(summary.byType as Record<string, { income: number; expenses: number; count: number }>)
    .sort(([, a], [, b]) => (b.expenses + b.income) - (a.expenses + a.income));

  const filteredTxs = filterType === "all" ? transactions : transactions.filter((t: any) => t.type === filterType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Expenses</h1>
        <p className="text-sm text-muted mt-1">Your spending and income overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Total Income</span>
            <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-accent" /></div>
          </div>
          <div className="text-2xl font-bold mt-2 text-accent">{fmtEur(summary.totalIncome)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Total Expenses</span>
            <div className="w-9 h-9 rounded-lg bg-destructive/15 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-destructive" /></div>
          </div>
          <div className="text-2xl font-bold mt-2 text-destructive">{fmtEur(summary.totalExpenses)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Net</span>
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center"><ArrowUpDown className="w-5 h-5 text-blue-500" /></div>
          </div>
          <div className={`text-2xl font-bold mt-2 ${summary.net >= 0 ? "text-accent" : "text-destructive"}`}>{fmtEur(summary.net)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Savings Rate</span>
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center"><PiggyBank className="w-5 h-5 text-purple-500" /></div>
          </div>
          <div className="text-2xl font-bold mt-2">{summary.savingsRate.toFixed(1)}%</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Monthly Overview</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "rgba(24, 24, 27, 0.95)", backdropFilter: "blur(8px)", border: "1px solid #3f3f46", borderRadius: 8, color: "#fafafa", padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
                itemStyle={{ color: "#fafafa" }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(v: any) => fmtEur(v)}
              />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
              <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">By Category</h2>
          <div className="space-y-3">
            {typeBreakdown.map(([type, vals]) => {
              const total = vals.income + vals.expenses;
              const maxTotal = Math.max(...typeBreakdown.map(([, v]) => v.income + v.expenses));
              const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3 cursor-pointer hover:bg-[var(--hover-bg)] rounded-lg p-1 -m-1 transition-colors"
                     onClick={() => setFilterType(filterType === type ? "all" : type)}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[type] || "#6b7280" }} />
                  <span className="text-sm w-28 flex-shrink-0">{TYPE_LABELS[type] || type}</span>
                  <div className="flex-1 h-2 bg-border/50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[type] || "#6b7280" }} />
                  </div>
                  <span className="text-xs text-muted w-8 text-right">{vals.count}</span>
                  <span className="text-xs font-medium w-24 text-right">{fmtEur(total)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-5 pb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Transactions</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="text-sm bg-transparent border border-border rounded-lg px-2 py-1 text-foreground">
              <option value="all">All Types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted text-xs uppercase tracking-wider border-t border-border">
              <th className="text-left py-3 px-5 font-medium">Date</th>
              <th className="text-left py-3 px-5 font-medium">Type</th>
              <th className="text-left py-3 px-5 font-medium">Description</th>
              <th className="text-right py-3 px-5 font-medium">Credit</th>
              <th className="text-right py-3 px-5 font-medium">Debit</th>
              <th className="text-right py-3 px-5 font-medium">Balance</th>
            </tr></thead>
            <tbody>
              {filteredTxs.slice(0, 100).map((tx: any, i: number) => (
                <tr key={i} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
                  <td className="py-3 px-5 whitespace-nowrap">{tx.date}</td>
                  <td className="py-3 px-5">
                    <span className="inline-flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[tx.type] || "#6b7280" }} />
                      <span className="text-xs">{TYPE_LABELS[tx.type] || tx.type}</span>
                    </span>
                  </td>
                  <td className="py-3 px-5 text-muted max-w-xs truncate">{tx.description}</td>
                  <td className="py-3 px-5 text-right text-accent">{tx.credit ? fmtEur(tx.credit) : ""}</td>
                  <td className="py-3 px-5 text-right text-destructive">{tx.debit ? fmtEur(tx.debit) : ""}</td>
                  <td className="py-3 px-5 text-right font-medium">{fmtEur(tx.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTxs.length > 100 && (
          <div className="p-4 text-center text-sm text-muted border-t border-border">
            Showing 100 of {filteredTxs.length} transactions
          </div>
        )}
      </Card>
    </div>
  );
}
