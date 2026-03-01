"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, Landmark, Wallet, ArrowLeftRight, CreditCard, PiggyBank } from "lucide-react";
import { ExchangeLogo } from "@/components/exchange-logo";
import { useCurrency } from "@/components/currency-provider";

interface AccountBreakdown {
  id: number; name: string; slug: string; category: string; logo: string;
  assets: { symbol: string; amount: number; value: number; price: number }[];
  totalValue: number;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

const catConfig: Record<string, { icon: typeof TrendingUp; color: string; bg: string; label: string }> = {
  exchange: { icon: ArrowLeftRight, color: "text-blue-400", bg: "bg-blue-500/15", label: "Exchanges" },
  broker: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/15", label: "Brokers" },
  bank: { icon: Landmark, color: "text-orange-400", bg: "bg-orange-500/15", label: "Banks" },
  wallet: { icon: Wallet, color: "text-cyan-400", bg: "bg-cyan-500/15", label: "Wallets" },
};

export default function NetWorthPage() {
  const router = useRouter();
  const { format, currency, rate } = useCurrency();
  const [data, setData] = useState<{ accounts: AccountBreakdown[]; summary: any; bankAccounts: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/net-worth").then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted">Loading...</div>;
  if (!data) return null;

  const { accounts, summary, bankAccounts } = data;

  // Group by category
  const grouped = new Map<string, AccountBreakdown[]>();
  for (const acc of accounts) {
    const cat = acc.category || "exchange";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(acc);
  }

  const fmt = format;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-[var(--hover-bg)] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Net Worth Breakdown</h1>
          <p className="text-sm text-muted mt-1">Where your money is right now</p>
        </div>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Net Worth</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <PiggyBank className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold mt-2">{fmt(summary.netWorth)}</div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Portfolio</span>
            <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold mt-2">{fmt(summary.portfolio)}</div>
          <div className="text-xs text-muted mt-1">{summary.netWorth > 0 ? ((summary.portfolio / summary.netWorth) * 100).toFixed(1) : 0}% of total</div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Banking</span>
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-orange-500" />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-bold mt-2">{fmt(summary.banking)}</div>
          <div className="text-xs text-muted mt-1">{summary.netWorth > 0 ? ((summary.banking / summary.netWorth) * 100).toFixed(1) : 0}% of total</div>
        </Card>
      </div>

      {/* Accounts by category */}
      {["exchange", "broker", "bank", "wallet"].map(cat => {
        const accs = grouped.get(cat);
        if (!accs?.length) return null;
        const cfg = catConfig[cat];
        const Icon = cfg.icon;
        const catTotal = accs.reduce((s, a) => s + a.totalValue, 0);

        return (
          <div key={cat} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">{cfg.label}</h2>
              </div>
              <span className="text-sm font-semibold">{fmt(catTotal)}</span>
            </div>

            {accs.map(acc => (
              <Card key={acc.id} className="overflow-hidden">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                  onClick={() => router.push(`/exchanges/${acc.id}`)}>
                  <div className="flex items-center gap-3">
                    <ExchangeLogo name={acc.name} logo={acc.logo} size={36} />
                    <div>
                      <h3 className="font-semibold">{acc.name}</h3>
                      <span className="text-xs text-muted">{acc.assets.length} asset{acc.assets.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{fmt(acc.totalValue)}</div>
                    <div className="text-xs text-muted">
                      {summary.netWorth > 0 ? ((acc.totalValue / summary.netWorth) * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                </div>

                {/* Bank sub-accounts */}
                {acc.category === "bank" && bankAccounts.filter(ba => ba.exchangeId === acc.id).length > 0 && (
                  <div className="border-t border-border/50">
                    {bankAccounts.filter(ba => ba.exchangeId === acc.id).map((ba: any) => (
                      <div key={ba.id} className="px-4 py-2.5 flex items-center justify-between border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-orange-400/60" />
                          <span className="text-sm">{ba.name}</span>
                        </div>
                        <span className="text-sm font-medium">{fmt(ba.balanceUsd)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Asset breakdown for non-bank */}
                {acc.category !== "bank" && acc.assets.length > 0 && (
                  <div className="border-t border-border/50">
                    {acc.assets.slice(0, 10).map(asset => (
                      <div key={asset.symbol} className="px-4 py-2 flex items-center justify-between border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium w-16">{asset.symbol}</span>
                          <span className="text-xs text-muted">{asset.amount < 0.01 ? asset.amount.toFixed(8) : asset.amount.toFixed(4)}</span>
                        </div>
                        <span className="text-sm font-medium">{fmt(asset.value)}</span>
                      </div>
                    ))}
                    {acc.assets.length > 10 && (
                      <div className="px-4 py-2 text-xs text-muted text-center">+{acc.assets.length - 10} more</div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}
