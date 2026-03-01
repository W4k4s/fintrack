"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Upload, AlertTriangle, Info,
  Check, X, History, Wallet, ChevronDown, ChevronUp,
  FileDown, ExternalLink,
} from "lucide-react";
import { ExchangeLogo } from "@/components/exchange-logo";
import { EXCHANGE_LIMITS } from "@/lib/exchange-info";

interface Asset {
  id: number; symbol: string; amount: number; currentPrice: number | null;
  lastUpdated: string | null;
}
interface Trade {
  id: number; date: string; type: string; symbol: string;
  amount: number; price: number; total: number; notes: string | null;
}
interface ExchangeData {
  exchange: { id: number; name: string; slug: string; type: string; lastSync: string | null; };
  assets: Asset[];
  trades: Trade[];
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

export default function ExchangeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<ExchangeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingTrades, setSyncingTrades] = useState(false);
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);

  const fetchData = async () => {
    try {
      const [exRes, tradesRes] = await Promise.all([
        fetch(`/api/exchanges/${id}/detail`).then(r => r.json()),
        fetch(`/api/exchanges/${id}/trades`).then(r => r.json()),
      ]);
      setData({ ...exRes, trades: tradesRes.trades || [] });
    } catch { }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/exchanges/${id}/sync`, { method: "POST" });
      await fetchData();
    } finally { setSyncing(false); }
  };

  const handleSyncTrades = async () => {
    setSyncingTrades(true); setTradeResult(null);
    try {
      const res = await fetch(`/api/exchanges/${id}/trades`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTradeResult(`Fetched ${data.totalFetched} trades — ${data.inserted} new, ${data.skipped} duplicates`);
        await fetchData();
      } else {
        setTradeResult(`Error: ${data.error}`);
      }
    } catch { setTradeResult("Sync failed"); }
    finally { setSyncingTrades(false); }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("exchangeId", id);
    try {
      const res = await fetch(`/api/exchanges/${id}/import-csv`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setTradeResult(`CSV imported: ${data.inserted} trades added, ${data.skipped} duplicates`);
        await fetchData();
      } else {
        setTradeResult(`CSV error: ${data.error}`);
      }
    } catch { setTradeResult("CSV import failed"); }
    e.target.value = "";
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted">Loading...</div>;
  if (!data?.exchange) return <div className="text-center py-12 text-muted">Exchange not found</div>;

  const { exchange, assets, trades } = data;
  const limits = EXCHANGE_LIMITS[exchange.slug];
  const totalValue = assets.reduce((s, a) => s + (a.amount * (a.currentPrice || 0)), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/exchanges")} className="p-2 hover:bg-[var(--hover-bg)] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <ExchangeLogo name={exchange.name} logo="" size={48} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{exchange.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>{assets.length} assets</span>
            <span>·</span>
            <span>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            {exchange.lastSync && (
              <>
                <span>·</span>
                <span>Synced {new Date(exchange.lastSync).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {exchange.type === "auto" && (
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              title="Sync balances">
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sync
            </button>
          )}
        </div>
      </div>

      {/* API Limitations Warning */}
      {limits && (
        <Card className="p-5">
          <button onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <div className="text-left">
                <h3 className="text-sm font-semibold">API Trade History: {limits.tradeHistory}</h3>
                <p className="text-xs text-muted mt-0.5">Import a CSV for complete trade history</p>
              </div>
            </div>
            {showInstructions ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
          </button>

          {showInstructions && (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted uppercase mb-2">API Limitations</h4>
                <ul className="space-y-1.5">
                  {limits.apiLimitations.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400/70" />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted uppercase mb-2 flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> How to export CSV from {exchange.name}
                </h4>
                <ol className="space-y-1.5">
                  {limits.csvInstructions.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted">
                      <span className="shrink-0 w-5 h-5 bg-accent/15 text-accent rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                {limits.csvNote && (
                  <p className="mt-2 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/10 rounded-lg p-2.5">
                    💡 {limits.csvNote}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap gap-3">
        {exchange.type === "auto" && (
          <button onClick={handleSyncTrades} disabled={syncingTrades}
            className="flex items-center gap-2 px-4 py-2.5 bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            <History className={`w-4 h-4 ${syncingTrades ? "animate-spin" : ""}`} />
            {syncingTrades ? "Syncing trades..." : "Sync Trades via API"}
          </button>
        )}
        <label className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-colors cursor-pointer">
          <Upload className="w-4 h-4" /> Import CSV
          <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
        </label>
      </div>

      {tradeResult && (
        <div className={`p-3 rounded-lg text-sm ${tradeResult.includes("Error") || tradeResult.includes("failed") ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
          {tradeResult}
        </div>
      )}

      {/* Assets */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Wallet className="w-4 h-4 text-accent" /> Holdings
        </h2>
        {assets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-3">Asset</th>
                  <th className="text-right py-2 px-3">Amount</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {assets.sort((a, b) => (b.amount * (b.currentPrice || 0)) - (a.amount * (a.currentPrice || 0))).map(a => (
                  <tr key={a.id} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
                    onClick={() => router.push(`/assets/${encodeURIComponent(a.symbol)}`)}>
                    <td className="py-2.5 px-3 font-medium">{a.symbol}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs">{a.amount < 0.01 ? a.amount.toFixed(8) : a.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    <td className="py-2.5 px-3 text-right text-muted">{a.currentPrice ? `$${a.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                    <td className="py-2.5 px-3 text-right font-medium">${(a.amount * (a.currentPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted text-center py-6">No assets found. Sync to fetch balances.</p>
        )}
      </Card>

      {/* Trade History */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-accent" /> Trade History
          <span className="text-xs text-muted font-normal">({trades.length} trades)</span>
        </h2>
        {trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Side</th>
                  <th className="text-left py-2 px-3">Asset</th>
                  <th className="text-right py-2 px-3">Amount</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {trades.map(tx => (
                  <tr key={tx.id} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="py-2.5 px-3 text-muted whitespace-nowrap">{tx.date}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium">
                      <Link href={`/assets/${encodeURIComponent(tx.symbol)}`} className="hover:text-accent transition-colors">
                        {tx.symbol}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs">{tx.amount < 0.01 ? tx.amount.toFixed(8) : tx.amount.toFixed(6)}</td>
                    <td className="py-2.5 px-3 text-right">${tx.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-medium">${tx.total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted">No trade history yet</p>
            <p className="text-xs text-muted mt-1">Sync trades via API or import a CSV file</p>
          </div>
        )}
      </Card>
    </div>
  );
}
