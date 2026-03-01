"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, ArrowUpDown } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";
import { ExchangeLogo } from "@/components/exchange-logo";
import { AssetIcon } from "@/components/asset-icon";

// Known exchange logos (client-side cache)
const exchangeLogos: Record<string, string> = {};

export default function AssetsPage() {
  const { format } = useCurrency();
  const [assets, setAssets] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<"value"|"symbol"|"total">("value");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/assets").then(r=>r.json()),
      fetch("/api/exchanges/available").then(r=>r.json()),
    ]).then(([a, av]) => {
      setAssets(a.assets || []);
      // Build logo lookup
      for (const ex of av) exchangeLogos[ex.id] = ex.logo;
      setAvailable(av);
    });
  }, []);

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

  const totalValue = assets.reduce((s: number, a: any) => s+(a.value||0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6"/> Assets</h1>
        <p className="text-sm text-muted mt-1">All your holdings across exchanges</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <input type="text" placeholder="Filter by symbol..." value={filter} onChange={e=>setFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-full sm:w-64 placeholder:text-muted-foreground"/>
        <div className="text-sm text-muted">Total: <span className="text-foreground font-bold">{format(totalValue)}</span></div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-muted text-xs uppercase tracking-wider border-b border-border">
            <th className="text-left py-3 px-3 md:px-5 font-medium cursor-pointer hover:text-foreground" onClick={()=>toggleSort("symbol")}>Asset <ArrowUpDown className="w-3 h-3 inline ml-1"/></th>
            <th className="text-left py-3 px-3 md:px-5 font-medium hidden sm:table-cell">Source</th>
            <th className="text-right py-3 px-3 md:px-5 font-medium cursor-pointer hover:text-foreground" onClick={()=>toggleSort("total")}>Amount <ArrowUpDown className="w-3 h-3 inline ml-1"/></th>
            <th className="text-right py-3 px-3 md:px-5 font-medium hidden min-[480px]:table-cell">Price</th>
            <th className="text-right py-3 px-3 md:px-5 font-medium cursor-pointer hover:text-foreground" onClick={()=>toggleSort("value")}>Value <ArrowUpDown className="w-3 h-3 inline ml-1"/></th>
            <th className="text-right py-3 px-3 md:px-5 font-medium hidden sm:table-cell">Portfolio</th>
          </tr></thead>
          <tbody>
            {sorted.length > 0 ? sorted.map(a => (
              <tr key={a.symbol} className="border-t border-border/50 hover:bg-[var(--hover-bg)] transition-colors cursor-pointer" onClick={() => window.location.href = `/assets/${encodeURIComponent(a.symbol)}`}>
                <td className="py-3 px-3 md:px-5">
                  <div className="flex items-center gap-2">
                    <AssetIcon symbol={a.symbol} size={20} />
                    <div>
                      <span className="font-semibold">{a.symbol}</span>
                      <div className="flex items-center gap-1 mt-0.5 sm:hidden">
                        {(a.exchanges || []).map((ex: any, i: number) => (
                          <ExchangeLogo key={i} name={ex.name} logo={exchangeLogos[ex.slug]} size={14} />
                        ))}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 md:px-5 hidden sm:table-cell">
                  <div className="flex items-center gap-1.5">
                    {(a.exchanges || []).map((ex: any, i: number) => (
                      <div key={i} title={`${ex.name}: ${ex.amount.toFixed(4)}`}>
                        <ExchangeLogo name={ex.name} logo={exchangeLogos[ex.slug]} size={22} />
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-3 md:px-5 text-right text-muted font-mono text-xs">{a.total < 0.001 ? a.total.toExponential(2) : a.total.toFixed(4)}</td>
                <td className="py-3 px-3 md:px-5 text-right text-muted hidden min-[480px]:table-cell">{a.price ? format(a.price) : "—"}</td>
                <td className="py-3 px-3 md:px-5 text-right font-medium">{format(a.value)}</td>
                <td className="py-3 px-3 md:px-5 text-right text-muted hidden sm:table-cell">{totalValue>0?((a.value/totalValue)*100).toFixed(1):0}%</td>
              </tr>
            )) : <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No assets yet. Connect an exchange first.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
