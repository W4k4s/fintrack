"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCurrency } from "@/components/currency-provider";
import { ExchangeLogo } from "@/components/exchange-logo";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft, TrendingUp, TrendingDown, BarChart3, History, Building2, LineChart as LineChartIcon,
} from "lucide-react";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol as string);
  const { format, convert } = useCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/assets/${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load asset"))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="text-center py-20 text-muted">{error || "Asset not found"}</div>
    </div>
  );

  const isPositive = (data.pl || 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <div>
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{data.symbol}</h1>
            <p className="text-sm text-muted mt-0.5">{data.name}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{format(data.totalValue)}</div>
            <div className="text-sm text-muted">
              {format(data.currentPrice)} per unit
            </div>
          </div>
        </div>
      </div>

      {/* Position Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-1">Holdings</div>
          <div className="text-lg font-bold">
            {data.totalAmount < 0.001 ? data.totalAmount.toExponential(2) : data.totalAmount.toFixed(6)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-1">Current Price</div>
          <div className="text-lg font-bold">{format(data.currentPrice)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-1">Avg Buy Price</div>
          <div className="text-lg font-bold">
            {data.avgBuyPrice ? format(data.avgBuyPrice) : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted uppercase tracking-wider mb-1">P/L</div>
          <div className={`text-lg font-bold flex items-center gap-1 ${data.pl != null ? (isPositive ? "text-emerald-400" : "text-red-400") : "text-muted"}`}>
            {data.pl != null ? (
              <>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {format(Math.abs(data.pl))}
                <span className="text-sm ml-1">({data.plPct?.toFixed(1)}%)</span>
              </>
            ) : "—"}
          </div>
        </Card>
      </div>

      {/* Price Chart */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <LineChartIcon className="w-4 h-4 text-accent" /> Price History (30d)
        </h2>
        {data.priceHistory && data.priceHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.priceHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(2)}
              />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                labelFormatter={(d) => String(d)}
                formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Price"]}
              />
              <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-10 text-muted text-sm">
            {data.isCrypto ? "Price data temporarily unavailable" : "Price history not available for this asset"}
          </div>
        )}
      </Card>

      {/* Exchange Breakdown */}
      {data.exchangeBreakdown.length > 1 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-accent" /> Exchange Breakdown
          </h2>
          <div className="space-y-3">
            {data.exchangeBreakdown.map((ex: any, i: number) => {
              const pct = data.totalAmount > 0 ? (ex.amount / data.totalAmount) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <ExchangeLogo name={ex.name} logo={undefined} size={28} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{ex.name}</span>
                      <span className="text-sm font-medium">{format(ex.value)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted mt-0.5">
                      <span>{ex.amount < 0.001 ? ex.amount.toExponential(2) : ex.amount.toFixed(6)} {data.symbol}</span>
                      <span>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Single exchange — simple display */}
      {data.exchangeBreakdown.length === 1 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-accent" /> Source
          </h2>
          <div className="flex items-center gap-3">
            <ExchangeLogo name={data.exchangeBreakdown[0].name} logo={undefined} size={28} />
            <span className="text-sm font-medium">{data.exchangeBreakdown[0].name}</span>
          </div>
        </Card>
      )}

      {/* Exchange Trades */}
      {data.exchangeTrades && data.exchangeTrades.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-accent" /> Exchange Trades
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Side</th>
                  <th className="text-left py-2 px-3">Exchange</th>
                  <th className="text-right py-2 px-3">Amount</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.exchangeTrades.map((tx: any) => (
                  <tr key={tx.id} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="py-2.5 px-3 text-muted whitespace-nowrap">{tx.date}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">{tx.exchange}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs">{tx.amount?.toFixed(6)}</td>
                    <td className="py-2.5 px-3 text-right">${tx.price?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td className="py-2.5 px-3 text-right font-medium">${tx.total?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Bank Statement Trades (Trade Republic) */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-accent" /> Bank Statement Trades
        </h2>
        {data.trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-left py-2 px-3">Description</th>
                  <th className="text-right py-2 px-3">Amount</th>
                  <th className="text-right py-2 px-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((tx: any) => {
                  const isBuy = tx.debit != null && tx.debit > 0;
                  const amount = tx.credit || tx.debit || 0;
                  return (
                    <tr key={tx.id} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
                      <td className="py-2.5 px-3 text-muted whitespace-nowrap">{tx.date}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          tx.type === "trade" ? (isBuy ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400") :
                          tx.type === "dividend" ? "bg-blue-500/10 text-blue-400" :
                          "bg-purple-500/10 text-purple-400"
                        }`}>
                          {tx.type === "trade" ? (isBuy ? "Buy" : "Sell") : tx.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted text-xs max-w-[300px] truncate">{tx.description}</td>
                      <td className={`py-2.5 px-3 text-right font-medium ${isBuy ? "text-red-400" : "text-emerald-400"}`}>
                        {isBuy ? "-" : "+"}{tx.currency === "EUR" ? "€" : "$"}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted">
                        {tx.balance != null ? `€${tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted text-sm">No trade history found for this asset</div>
        )}
      </Card>
    </div>
  );
}
