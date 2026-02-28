"use client";
import { useEffect, useState } from "react";
import { Receipt, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Tx { id: number; type: string; symbol: string; amount: number; price: number|null; total: number|null; date: string; notes: string|null; }

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "buy", symbol: "", amount: "", price: "", date: new Date().toISOString().split("T")[0], notes: "" });

  const fetchTxs = () => fetch("/api/transactions").then(r=>r.json()).then(setTxs);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6"/> Transactions</h1>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium"><Plus className="w-4 h-4"/> Add Transaction</button>
      </div>

      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
              <option value="buy">Buy</option><option value="sell">Sell</option><option value="transfer">Transfer</option><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option>
            </select>
            <input placeholder="Symbol (BTC)" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <input placeholder="Amount" type="number" step="any" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <input placeholder="Price (USD)" type="number" step="any" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <input placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium">Add</button>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-zinc-400 border-b border-zinc-800">
            <th className="text-left py-3 px-4">Date</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Asset</th>
            <th className="text-right py-3 px-4">Amount</th><th className="text-right py-3 px-4">Price</th><th className="text-right py-3 px-4">Total</th><th className="py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {txs.length > 0 ? txs.map(tx => (
              <tr key={tx.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-3 px-4 text-zinc-400">{tx.date}</td>
                <td className={`py-3 px-4 capitalize font-medium ${typeColors[tx.type]||""}`}>{tx.type}</td>
                <td className="py-3 px-4">{tx.symbol}</td>
                <td className="py-3 px-4 text-right">{tx.amount}</td>
                <td className="py-3 px-4 text-right text-zinc-400">{tx.price ? formatCurrency(tx.price) : "—"}</td>
                <td className="py-3 px-4 text-right">{tx.total ? formatCurrency(tx.total) : "—"}</td>
                <td className="py-3 px-4 text-right"><button onClick={()=>handleDelete(tx.id)} className="p-1 hover:bg-red-900/50 text-red-500 rounded"><Trash2 className="w-3 h-3"/></button></td>
              </tr>
            )) : <tr><td colSpan={7} className="py-8 text-center text-zinc-500">No transactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
