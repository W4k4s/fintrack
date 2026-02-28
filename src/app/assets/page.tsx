"use client";
import { useEffect, useState } from "react";
import { Wallet, ArrowUpDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<"value"|"symbol"|"total">("value");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [filter, setFilter] = useState("");

  useEffect(() => { fetch("/api/assets").then(r=>r.json()).then(d=>setAssets(d.assets||[])); }, []);

  const toggleSort = (col: "value"|"symbol"|"total") => {
    if (sortBy === col) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const sorted = [...assets]
    .filter(a => a.symbol.toLowerCase().includes(filter.toLowerCase()))
    .sort((a,b) => {
      const mul = sortDir==="asc"?1:-1;
      if (sortBy==="symbol") return mul*a.symbol.localeCompare(b.symbol);
      return mul*((a[sortBy]||0)-(b[sortBy]||0));
    });

  const totalValue = assets.reduce((s,a) => s+(a.value||0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6"/> Assets</h1>
      <div className="flex items-center justify-between">
        <input type="text" placeholder="Filter by symbol..." value={filter} onChange={e=>setFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500 w-64"/>
        <div className="text-sm text-zinc-400">Total: <span className="text-white font-bold">{formatCurrency(totalValue)}</span></div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-zinc-400 border-b border-zinc-800">
            <th className="text-left py-3 px-4 cursor-pointer hover:text-white" onClick={()=>toggleSort("symbol")}>Asset <ArrowUpDown className="w-3 h-3 inline"/></th>
            <th className="text-right py-3 px-4 cursor-pointer hover:text-white" onClick={()=>toggleSort("total")}>Amount <ArrowUpDown className="w-3 h-3 inline"/></th>
            <th className="text-right py-3 px-4 cursor-pointer hover:text-white" onClick={()=>toggleSort("value")}>Value <ArrowUpDown className="w-3 h-3 inline"/></th>
            <th className="text-right py-3 px-4">% Portfolio</th>
          </tr></thead>
          <tbody>
            {sorted.length > 0 ? sorted.map(a => (
              <tr key={a.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-3 px-4 font-medium">{a.symbol}</td>
                <td className="py-3 px-4 text-right text-zinc-400">{a.total.toFixed(6)}</td>
                <td className="py-3 px-4 text-right">{formatCurrency(a.value)}</td>
                <td className="py-3 px-4 text-right text-zinc-400">{totalValue>0?((a.value/totalValue)*100).toFixed(1):0}%</td>
              </tr>
            )) : <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No assets yet. Connect an exchange first.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
