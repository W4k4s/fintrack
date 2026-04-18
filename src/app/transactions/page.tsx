"use client";
import { useEffect, useState } from "react";
import { Receipt, Plus, Trash2 } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";
import { AssetIcon } from "@/components/asset-icon";
import { ExchangeLogo } from "@/components/exchange-logo";

const exchangeLogos: Record<string, string> = {};

interface Tx { id: number; type: string; symbol: string; amount: number; price: number|null; total: number|null; quoteCurrency: string; date: string; notes: string|null; exchangeName: string|null; exchangeSlug: string|null; }

export default function TransactionsPage() {
  const { formatFrom } = useCurrency();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "buy", symbol: "", amount: "", price: "", date: new Date().toISOString().split("T")[0], notes: "" });

  const fetchTxs = () => Promise.all([
    fetch("/api/transactions").then(r=>r.json()),
    fetch("/api/exchanges/available").then(r=>r.json()),
  ]).then(([t, av]) => {
    setTxs(t);
    for (const ex of av) exchangeLogos[ex.id] = ex.logo;
    setAvailable(av);
  });
  useEffect(() => { fetchTxs(); }, []);

  const handleCreate = async () => {
    await fetch("/api/transactions", { method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount), price: form.price ? parseFloat(form.price) : null }) });
    setForm({ type:"buy", symbol:"", amount:"", price:"", date: new Date().toISOString().split("T")[0], notes:"" }); setShowForm(false); fetchTxs();
  };
  const handleDelete = async (id: number) => {
    await fetch("/api/transactions", { method: "DELETE", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id }) }); fetchTxs();
  };

  const typeColors: Record<string,string> = { buy: "text-emerald-500", sell: "text-red-500", transfer: "text-blue-500", deposit: "text-yellow-500", withdrawal: "text-orange-500" };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6"/> Transactions</h1>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium w-fit">
          <Plus className="w-4 h-4"/> Add Transaction
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="px-3 py-2 bg-background border border-border rounded-lg text-sm">
              <option value="buy">Buy</option><option value="sell">Sell</option><option value="transfer">Transfer</option><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option>
            </select>
            <input placeholder="Symbol (BTC)" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value})} className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"/>
            <input placeholder="Amount" type="number" step="any" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"/>
            <input placeholder="Price (USD)" type="number" step="any" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"/>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"/>
            <input placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"/>
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium">Add</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-muted text-xs uppercase border-b border-border">
            <th className="text-left py-2.5 px-3 md:px-4">Date</th>
            <th className="text-left py-2.5 px-3 md:px-4">Type</th>
            <th className="text-left py-2.5 px-3 md:px-4">Asset</th>
            <th className="text-right py-2.5 px-3 md:px-4">Amount</th>
            <th className="text-right py-2.5 px-3 md:px-4 hidden sm:table-cell">Price</th>
            <th className="text-right py-2.5 px-3 md:px-4 hidden sm:table-cell">Total</th>
            <th className="py-2.5 px-2 w-8"></th>
          </tr></thead>
          <tbody>
            {txs.length > 0 ? txs.map(tx => (
              <tr key={tx.id} className="border-b border-border/50 hover:bg-[var(--hover-bg)] transition-colors">
                <td className="py-2.5 px-3 md:px-4 text-muted whitespace-nowrap text-xs">{tx.date}</td>
                <td className={`py-2.5 px-3 md:px-4 capitalize font-medium text-xs ${typeColors[tx.type]||""}`}>{tx.type}</td>
                <td className="py-2.5 px-3 md:px-4">
                  <div className="flex items-center gap-2">
                    <AssetIcon symbol={tx.symbol} size={20} />
                    <div>
                      <span className="font-medium">{tx.symbol}</span>
                      {tx.exchangeName && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <ExchangeLogo name={tx.exchangeName} logo={exchangeLogos[tx.exchangeSlug || ""] || ""} size={14} />
                          <span className="text-[10px] text-muted hidden sm:inline">{tx.exchangeName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 md:px-4 text-right font-mono text-xs">{tx.amount < 0.01 ? tx.amount.toFixed(8) : tx.amount.toLocaleString(undefined, {maximumFractionDigits: 6})}</td>
                <td className="py-2.5 px-3 md:px-4 text-right text-muted hidden sm:table-cell">{tx.price ? formatFrom(tx.price, tx.quoteCurrency || "USD") : "—"}</td>
                <td className="py-2.5 px-3 md:px-4 text-right hidden sm:table-cell">{tx.total ? formatFrom(tx.total, tx.quoteCurrency || "USD") : "—"}</td>
                <td className="py-2.5 px-2 text-right"><button onClick={()=>handleDelete(tx.id)} className="p-1 hover:bg-destructive/20 text-destructive rounded"><Trash2 className="w-3 h-3"/></button></td>
              </tr>
            )) : <tr><td colSpan={7} className="py-8 text-center text-muted">No transactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
