"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Upload, AlertTriangle, Info,
  Check, X, History, Wallet, ChevronDown, ChevronUp,
  FileDown, ExternalLink, FileText, CheckCircle, Landmark,
  Pencil, CreditCard, ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { ExchangeLogo } from "@/components/exchange-logo";
import { useCurrency } from "@/components/currency-provider";
import { EXCHANGE_LIMITS } from "@/lib/exchange-info";

interface Asset {
  id: number; symbol: string; amount: number; currentPrice: number | null;
  lastUpdated: string | null;
}
interface Trade {
  id: number; date: string; type: string; symbol: string;
  amount: number; price: number; total: number; quoteCurrency: string; notes: string | null;
}
interface ExchangeData {
  exchange: { id: number; name: string; slug: string; type: string; lastSync: string | null; logo: string; };
  assets: Asset[];
  trades: Trade[];
}
interface BankAccountInfo {
  id: number; source: string; accountNumber: string; name: string;
  balance: number; lastDate: string | null; transactionCount: number;
  totalIn: number; totalOut: number; oldestDate: string | null;
}
interface BankTx {
  id: number; date: string; type: string; description: string;
  credit: number | null; debit: number | null; balance: number;
  category: string | null;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

// ING-specific types
interface INGPreviewFile {
  accountNumber: string; holder: string; exportDate: string;
  transactionCount: number; firstDate: string; lastDate: string;
  sample: Array<{ date: string; category: string; subcategory: string; description: string; amount: number; balance: number; type: string }>;
}

function BankAccountCard({ acc, onRename }: { acc: BankAccountInfo; onRename: (id: number, name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txOffset, setTxOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(acc.name);

  const loadTxs = useCallback(async (offset: number = 0) => {
    setTxLoading(true);
    const res = await fetch(`/api/bank-accounts/transactions?source=${acc.source}&limit=50&offset=${offset}`);
    const data = await res.json();
    if (offset === 0) {
      setTxs(data);
    } else {
      setTxs(prev => [...prev, ...data]);
    }
    setHasMore(data.length === 50);
    setTxOffset(offset + data.length);
    setTxLoading(false);
  }, [acc.source]);

  const toggleExpand = () => {
    if (!expanded && txs.length === 0) loadTxs(0);
    setExpanded(!expanded);
  };

  const saveName = async () => {
    if (editName.trim() && editName !== acc.name) {
      onRename(acc.id, editName.trim());
    }
    setEditing(false);
  };

  const typeColors: Record<string, string> = {
    expense: "bg-red-500/10 text-red-400",
    income: "bg-emerald-500/10 text-emerald-400",
    transfer_in: "bg-blue-500/10 text-blue-400",
    transfer_out: "bg-orange-500/10 text-orange-400",
    savings: "bg-purple-500/10 text-purple-400",
    other: "bg-zinc-500/10 text-zinc-400",
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveName()}
                    onBlur={saveName} autoFocus
                    className="text-base font-semibold bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{acc.name}</h3>
                  <button onClick={() => { setEditing(true); setEditName(acc.name); }}
                    className="p-1 hover:bg-[var(--hover-bg)] rounded transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-muted" />
                  </button>
                </div>
              )}
              <p className="text-xs text-muted font-mono">{acc.accountNumber}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">€{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted">Current balance</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 py-3 border-t border-border/50">
          <div>
            <div className="text-xs text-muted">Transactions</div>
            <div className="text-sm font-semibold">{acc.transactionCount.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-muted flex items-center gap-1"><ArrowDownLeft className="w-3 h-3 text-emerald-400" /> Total In</div>
            <div className="text-sm font-semibold text-emerald-400">€{acc.totalIn.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div>
            <div className="text-xs text-muted flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-red-400" /> Total Out</div>
            <div className="text-sm font-semibold text-red-400">€{acc.totalOut.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
        <div className="text-xs text-muted">
          History: {acc.oldestDate} → {acc.lastDate}
        </div>
      </div>

      {/* Transactions toggle */}
      <button onClick={toggleExpand}
        className="w-full px-5 py-3 border-t border-border/50 flex items-center justify-between text-sm hover:bg-[var(--hover-bg)] transition-colors">
        <span className="font-medium text-accent">Transactions</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Type</th>
                  <th className="text-left py-2 px-4">Description</th>
                  <th className="text-left py-2 px-4">Category</th>
                  <th className="text-right py-2 px-4">Amount</th>
                  <th className="text-right py-2 px-4">Balance</th>
                </tr>
              </thead>
              <tbody>
                {txs.map(tx => (
                  <tr key={tx.id} className="border-b border-border/30 hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="py-2 px-4 text-muted whitespace-nowrap">{tx.date}</td>
                    <td className="py-2 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${typeColors[tx.type] || typeColors.other}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-4 max-w-[250px] truncate">{tx.description}</td>
                    <td className="py-2 px-4 text-xs text-muted max-w-[150px] truncate">{tx.category || "—"}</td>
                    <td className={`py-2 px-4 text-right font-medium ${tx.credit ? "text-emerald-400" : "text-red-400"}`}>
                      {tx.credit ? `+${tx.credit.toFixed(2)}` : `-${tx.debit?.toFixed(2)}`} €
                    </td>
                    <td className="py-2 px-4 text-right text-muted">{tx.balance?.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {txLoading && <div className="p-4 text-center text-sm text-muted">Loading...</div>}
          {hasMore && !txLoading && (
            <button onClick={() => loadTxs(txOffset)}
              className="w-full py-3 text-sm text-accent font-medium hover:bg-[var(--hover-bg)] transition-colors">
              Load more...
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ExchangeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { formatFrom } = useCurrency();

  const [data, setData] = useState<ExchangeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingTrades, setSyncingTrades] = useState(false);
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [trParsing, setTrParsing] = useState(false);
  const [trPreview, setTrPreview] = useState<any>(null);
  const [trImported, setTrImported] = useState<any>(null);

  // ING state
  const [ingParsing, setIngParsing] = useState(false);
  const [ingPreview, setIngPreview] = useState<INGPreviewFile[] | null>(null);
  const [ingImported, setIngImported] = useState<{ imported: number; skipped: number } | null>(null);
  const [ingFiles, setIngFiles] = useState<File[] | null>(null);

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState<BankAccountInfo[]>([]);

  const fetchData = async () => {
    try {
      const [exRes, tradesRes] = await Promise.all([
        fetch(`/api/exchanges/${id}/detail`).then(r => r.json()),
        fetch(`/api/exchanges/${id}/trades`).then(r => r.json()),
      ]);
      setData({ ...exRes, trades: tradesRes.trades || [] });

      // Fetch bank accounts if this is a bank
      if (exRes.exchange?.slug === "ing") {
        const bankRes = await fetch(`/api/bank-accounts?exchangeId=${id}`).then(r => r.json());
        setBankAccounts(bankRes);
      }
    } catch { }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    try { await fetch(`/api/exchanges/${id}/sync`, { method: "POST" }); await fetchData(); }
    finally { setSyncing(false); }
  };
  const handleSyncTrades = async () => {
    setSyncingTrades(true); setTradeResult(null);
    try {
      const res = await fetch(`/api/exchanges/${id}/trades`, { method: "POST" });
      const d = await res.json();
      if (d.success) { setTradeResult(`Fetched ${d.totalFetched} trades — ${d.inserted} new, ${d.skipped} duplicates`); await fetchData(); }
      else setTradeResult(`Error: ${d.error}`);
    } catch { setTradeResult("Sync failed"); }
    finally { setSyncingTrades(false); }
  };
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const formData = new FormData(); formData.append("file", file); formData.append("exchangeId", id);
    try {
      const res = await fetch(`/api/exchanges/${id}/import-csv`, { method: "POST", body: formData });
      const d = await res.json();
      if (d.success) { setTradeResult(`CSV imported: ${d.inserted} trades added, ${d.skipped} duplicates`); await fetchData(); }
      else setTradeResult(`CSV error: ${d.error}`);
    } catch { setTradeResult("CSV import failed"); }
    e.target.value = "";
  };
  const handleTrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setTrParsing(true); setTradeResult(null); setTrPreview(null); setTrImported(null);
    const formData = new FormData(); Array.from(files).forEach(f => formData.append("files", f));
    try {
      const res = await fetch("/api/import/trade-republic", { method: "POST", body: formData });
      const d = await res.json(); if (d.error) throw new Error(d.error);
      setTrPreview({ ...d, origin: "pdf" });
    } catch (err: any) { setTradeResult(`Error: ${err.message}`); }
    finally { setTrParsing(false); }
    e.target.value = "";
  };
  const handleTrCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setTrParsing(true); setTradeResult(null); setTrPreview(null); setTrImported(null);
    const formData = new FormData(); Array.from(files).forEach(f => formData.append("files", f));
    try {
      const res = await fetch("/api/import/trade-republic-csv", { method: "POST", body: formData });
      const d = await res.json(); if (d.error) throw new Error(d.error);
      setTrPreview({ ...d, origin: "csv" });
    } catch (err: any) { setTradeResult(`Error: ${err.message}`); }
    finally { setTrParsing(false); }
    e.target.value = "";
  };
  const handleTrConfirm = async () => {
    if (!trPreview) return;
    setTrParsing(true);
    const endpoint = trPreview.origin === "csv"
      ? "/api/import/trade-republic-csv/confirm"
      : "/api/import/trade-republic/confirm";
    try {
      const res = await fetch(endpoint, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(trPreview) });
      const d = await res.json(); if (d.error) throw new Error(d.error);
      setTrImported(d.imported); setTrPreview(null); await fetchData();
    } catch (err: any) { setTradeResult(`Error: ${err.message}`); }
    finally { setTrParsing(false); }
  };

  // ING handlers
  const handleIngUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setIngParsing(true); setTradeResult(null); setIngPreview(null); setIngImported(null);
    const formData = new FormData();
    const fileList = Array.from(files);
    fileList.forEach(f => formData.append("files", f));
    formData.append("action", "preview");
    setIngFiles(fileList);
    try {
      const res = await fetch("/api/import/ing", { method: "POST", body: formData });
      const d = await res.json(); if (d.error) throw new Error(d.error);
      setIngPreview(d.files);
    } catch (err: any) { setTradeResult(`Error: ${err.message}`); }
    finally { setIngParsing(false); }
    e.target.value = "";
  };
  const handleIngConfirm = async () => {
    if (!ingFiles) return;
    setIngParsing(true);
    const formData = new FormData();
    ingFiles.forEach(f => formData.append("files", f));
    formData.append("action", "import");
    try {
      const res = await fetch("/api/import/ing", { method: "POST", body: formData });
      const d = await res.json(); if (d.error) throw new Error(d.error);
      setIngImported(d); setIngPreview(null); setIngFiles(null); await fetchData();
    } catch (err: any) { setTradeResult(`Error: ${err.message}`); }
    finally { setIngParsing(false); }
  };

  const handleRenameBankAccount = async (accId: number, name: string) => {
    await fetch("/api/bank-accounts", { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: accId, name }) });
    setBankAccounts(prev => prev.map(a => a.id === accId ? { ...a, name } : a));
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted">Loading...</div>;
  if (!data?.exchange) return <div className="text-center py-12 text-muted">Exchange not found</div>;

  const { exchange, assets, trades } = data;
  const limits = EXCHANGE_LIMITS[exchange.slug];
  const totalValue = assets.reduce((s, a) => s + (a.amount * (a.currentPrice || 0)), 0);
  const isIng = exchange.slug === "ing";
  const isTR = exchange.slug === "trade-republic";
  const isBank = isIng;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/exchanges")} className="p-2 hover:bg-[var(--hover-bg)] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <ExchangeLogo name={exchange.name} logo={exchange.logo} size={48} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{exchange.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted">
            {isBank ? (
              <>
                <span>{bankAccounts.length} account{bankAccounts.length !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>€{bankAccounts.reduce((s, a) => s + a.balance, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </>
            ) : (
              <>
                <span>{assets.length} assets</span>
                <span>·</span>
                <span>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </>
            )}
            {exchange.lastSync && (
              <><span>·</span><span>Synced {new Date(exchange.lastSync).toLocaleDateString()}</span></>
            )}
          </div>
        </div>
        {exchange.type === "auto" && (
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sync
          </button>
        )}
      </div>

      {/* Bank Accounts */}
      {isBank && bankAccounts.length > 0 && (
        <div className="space-y-4">
          {bankAccounts.map(acc => (
            <BankAccountCard key={acc.id} acc={acc} onRename={handleRenameBankAccount} />
          ))}
        </div>
      )}

      {/* ING Import */}
      {isIng && (
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Landmark className="w-5 h-5 text-orange-400" />
            <div>
              <h3 className="text-sm font-semibold">Import Transactions</h3>
              <p className="text-xs text-muted mt-0.5">Upload your ING Excel export files (.xls)</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="p-3 bg-orange-500/5 border border-orange-500/10 rounded-lg">
              <h4 className="text-xs font-semibold text-orange-400 uppercase mb-2">How to export from ING</h4>
              <ol className="space-y-1.5 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 bg-orange-500/15 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Go to ing.es → Mi Posición → select your account
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 bg-orange-500/15 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Click &quot;Buscar movimientos&quot; and select the date range
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 bg-orange-500/15 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  Click the download icon → Excel (.xls)
                </li>
              </ol>
            </div>
            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-colors cursor-pointer">
              <Upload className="w-4 h-4" /> {ingParsing ? "Parsing..." : "Upload ING Excel Files"}
              <input type="file" accept=".xls,.xlsx" multiple onChange={handleIngUpload} className="hidden" disabled={ingParsing} />
            </label>
          </div>
        </Card>
      )}

      {/* ING Preview */}
      {ingPreview && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Preview — ING Transactions</h2>
          {ingPreview.map((file, fi) => (
            <div key={fi} className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-orange-500/5 rounded-lg">
                <div>
                  <div className="text-sm font-medium">Account: {file.accountNumber}</div>
                  <div className="text-xs text-muted">{file.firstDate} → {file.lastDate} · Exported {file.exportDate}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{file.transactionCount}</div>
                  <div className="text-xs text-muted">transactions</div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-3">Date</th><th className="text-left py-2 px-3">Description</th>
                  <th className="text-left py-2 px-3">Category</th><th className="text-right py-2 px-3">Amount</th>
                </tr></thead>
                <tbody>{file.sample.map((tx, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 px-3 text-muted whitespace-nowrap">{tx.date}</td>
                    <td className="py-2 px-3 truncate max-w-[200px]">{tx.description}</td>
                    <td className="py-2 px-3 text-muted text-xs">{tx.category || "—"}</td>
                    <td className={`py-2 px-3 text-right font-medium ${tx.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)} €
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {file.transactionCount > 5 && <p className="text-xs text-muted text-center">... and {file.transactionCount - 5} more</p>}
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => { setIngPreview(null); setIngFiles(null); }} className="px-4 py-2.5 text-sm bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors">Cancel</button>
            <button onClick={handleIngConfirm} disabled={ingParsing} className="px-6 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50">
              {ingParsing ? "Importing..." : "Confirm Import"}
            </button>
          </div>
        </Card>
      )}

      {/* ING Import Success */}
      {ingImported && (
        <Card className="p-5">
          <div className="flex items-center gap-3 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            <div className="text-sm">Imported {ingImported.imported} transactions{ingImported.skipped > 0 && `, ${ingImported.skipped} duplicates skipped`}</div>
          </div>
        </Card>
      )}

      {/* API Limitations Warning */}
      {limits && (
        <Card className="p-5">
          <button onClick={() => setShowInstructions(!showInstructions)} className="w-full flex items-center justify-between">
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
                <ul className="space-y-1.5">{limits.apiLimitations.map((l: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400/70" />{l}</li>
                ))}</ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted uppercase mb-2 flex items-center gap-1.5"><FileDown className="w-3.5 h-3.5" /> How to export CSV from {exchange.name}</h4>
                <ol className="space-y-1.5">{limits.csvInstructions.map((step: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted">
                    <span className="shrink-0 w-5 h-5 bg-accent/15 text-accent rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>{step}
                  </li>
                ))}</ol>
                {limits.csvNote && <p className="mt-2 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/10 rounded-lg p-2.5">💡 {limits.csvNote}</p>}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Actions Bar (non-bank) */}
      {!isBank && (
        <div className="flex flex-wrap gap-3">
          {exchange.type === "auto" && (
            <button onClick={handleSyncTrades} disabled={syncingTrades}
              className="flex items-center gap-2 px-4 py-2.5 bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <History className={`w-4 h-4 ${syncingTrades ? "animate-spin" : ""}`} />
              {syncingTrades ? "Syncing trades..." : "Sync Trades via API"}
            </button>
          )}
          {isTR ? (
            <>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-colors cursor-pointer">
                <Upload className="w-4 h-4" /> {trParsing ? "Parsing..." : "Import CSV"}
                <input type="file" accept=".csv" onChange={handleTrCsvUpload} className="hidden" disabled={trParsing} />
              </label>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors cursor-pointer">
                <Upload className="w-4 h-4" /> Import PDFs
                <input type="file" accept=".pdf" multiple onChange={handleTrUpload} className="hidden" disabled={trParsing} />
              </label>
            </>
          ) : exchange.type === "auto" ? (
            <label className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-colors cursor-pointer">
              <Upload className="w-4 h-4" /> Import CSV
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            </label>
          ) : null}
        </div>
      )}

      {/* TR Preview/Import */}
      {trPreview && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">
            Preview — {trPreview.origin === "csv" ? `CSV (${trPreview.dateRange || ""})` : "PDFs"}
          </h2>
          {trPreview.dryRun && (
            <div className="p-3 bg-accent/5 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted">Total transacciones en CSV</span><span className="font-medium">{trPreview.transactionCount}</span></div>
              <div className="flex justify-between"><span className="text-muted">Ya existen (dedup por UUID)</span><span className="font-medium">{trPreview.dryRun.duplicates}</span></div>
              <div className="flex justify-between"><span className="text-muted">Se insertarían</span><span className="font-medium text-emerald-400">{trPreview.dryRun.wouldInsert}</span></div>
            </div>
          )}
          {trPreview.securities?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">Securities ({trPreview.securities.length})</h3>
              <table className="w-full text-sm"><thead><tr className="text-xs text-muted uppercase border-b border-border">
                <th className="text-left py-2 px-3">Symbol</th><th className="text-left py-2 px-3">Name</th>
                <th className="text-right py-2 px-3">Qty</th><th className="text-right py-2 px-3">Value (€)</th>
              </tr></thead><tbody>{trPreview.securities.map((s: any, i: number) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 px-3 font-medium">{s.symbol}</td><td className="py-2 px-3 text-muted">{s.name?.substring(0, 35)}</td>
                  <td className="py-2 px-3 text-right">{s.quantity?.toFixed(4)}</td><td className="py-2 px-3 text-right font-medium">€{s.valueEur?.toLocaleString()}</td>
                </tr>
              ))}</tbody></table>
            </div>
          )}
          {trPreview.cashBalance != null && (
            <div className="flex items-center justify-between p-3 bg-accent/5 rounded-lg">
              <span className="text-sm font-medium">Cash Balance</span><span className="text-lg font-bold">€{trPreview.cashBalance?.toLocaleString()}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setTrPreview(null)} className="px-4 py-2.5 text-sm bg-card hover:bg-[var(--hover-bg)] border border-border rounded-lg transition-colors">Cancel</button>
            <button onClick={handleTrConfirm} disabled={trParsing} className="px-6 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50">
              {trParsing ? "Importing..." : "Confirm Import"}
            </button>
          </div>
        </Card>
      )}
      {trImported && (
        <Card className="p-5"><div className="flex items-center gap-3 text-emerald-400"><CheckCircle className="w-5 h-5" />
          <div className="text-sm">Imported: {trImported.securities} securities, {trImported.crypto} crypto, {trImported.transactions} transactions</div>
        </div></Card>
      )}

      {tradeResult && (
        <div className={`p-3 rounded-lg text-sm ${tradeResult.includes("Error") || tradeResult.includes("failed") ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
          {tradeResult}
        </div>
      )}

      {/* Assets (non-bank only) */}
      {!isBank && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><Wallet className="w-4 h-4 text-accent" /> Holdings</h2>
          {assets.length > 0 ? (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-muted uppercase border-b border-border">
              <th className="text-left py-2 px-3">Asset</th><th className="text-right py-2 px-3">Amount</th>
              <th className="text-right py-2 px-3">Price</th><th className="text-right py-2 px-3">Value</th>
            </tr></thead><tbody>
              {assets.sort((a, b) => (b.amount * (b.currentPrice || 0)) - (a.amount * (a.currentPrice || 0))).map(a => (
                <tr key={a.id} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
                  onClick={() => router.push(`/assets/${encodeURIComponent(a.symbol)}`)}>
                  <td className="py-2.5 px-3 font-medium">{a.symbol}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{a.amount < 0.01 ? a.amount.toFixed(8) : a.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                  <td className="py-2.5 px-3 text-right text-muted">{a.currentPrice ? `$${a.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                  <td className="py-2.5 px-3 text-right font-medium">${(a.amount * (a.currentPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <p className="text-sm text-muted text-center py-6">No assets found. Sync to fetch balances.</p>}
        </Card>
      )}

      {/* Trades (non-bank only) */}
      {!isBank && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-accent" /> Trade History <span className="text-xs text-muted font-normal">({trades.length} trades)</span>
          </h2>
          {trades.length > 0 ? (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-muted uppercase border-b border-border">
              <th className="text-left py-2 px-3">Date</th><th className="text-left py-2 px-3">Side</th>
              <th className="text-left py-2 px-3">Asset</th><th className="text-right py-2 px-3">Amount</th>
              <th className="text-right py-2 px-3">Price</th><th className="text-right py-2 px-3">Total</th>
            </tr></thead><tbody>
              {trades.map(tx => (
                <tr key={tx.id} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
                  <td className="py-2.5 px-3 text-muted whitespace-nowrap">{tx.date}</td>
                  <td className="py-2.5 px-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tx.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{tx.type}</span></td>
                  <td className="py-2.5 px-3 font-medium"><Link href={`/assets/${encodeURIComponent(tx.symbol)}`} className="hover:text-accent transition-colors">{tx.symbol}</Link></td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{tx.amount < 0.01 ? tx.amount.toFixed(8) : tx.amount.toFixed(6)}</td>
                  <td className="py-2.5 px-3 text-right">{tx.price != null ? formatFrom(tx.price, tx.quoteCurrency || "USD") : "—"}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{tx.total != null ? formatFrom(tx.total, tx.quoteCurrency || "USD") : "—"}</td>
                </tr>
              ))}
            </tbody></table></div>
          ) : (
            <div className="text-center py-8"><p className="text-sm text-muted">No trade history yet</p></div>
          )}
        </Card>
      )}
    </div>
  );
}
