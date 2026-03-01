"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, RefreshCw, Check, X, Search, Shield, ChevronRight, ArrowLeftRight, TrendingUp, Landmark, Wallet } from "lucide-react";
import { ExchangeLogo } from "@/components/exchange-logo";
import type { AccountCategory } from "@/lib/exchanges/registry";

interface ExchangeInfo { id: string; name: string; logo: string; category: AccountCategory; type: "auto"|"manual"; requiresPassphrase: boolean; tags: string[]; importFormat?: string; }
interface ConnectedExchange { id: number; name: string; slug: string; type: string; enabled: boolean; lastSync: string|null; hasApiKey: boolean; }

const categoryConfig: Record<AccountCategory, { label: string; plural: string; icon: typeof ArrowLeftRight; color: string; tagColor: string }> = {
  exchange: { label: "Exchange", plural: "Exchanges", icon: ArrowLeftRight, color: "text-blue-400", tagColor: "bg-blue-500/15 text-blue-400" },
  broker: { label: "Broker", plural: "Brokers", icon: TrendingUp, color: "text-emerald-400", tagColor: "bg-emerald-500/15 text-emerald-400" },
  bank: { label: "Bank", plural: "Banks", icon: Landmark, color: "text-orange-400", tagColor: "bg-orange-500/15 text-orange-400" },
  wallet: { label: "Wallet", plural: "Wallets", icon: Wallet, color: "text-cyan-400", tagColor: "bg-cyan-500/15 text-cyan-400" },
};

const categoryOrder: AccountCategory[] = ["exchange", "broker", "bank", "wallet"];

export default function AccountsPage() {
  const router = useRouter();
  const [connected, setConnected] = useState<ConnectedExchange[]>([]);
  const [available, setAvailable] = useState<ExchangeInfo[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardCategory, setWizardCategory] = useState<AccountCategory | null>(null);
  const [selected, setSelected] = useState<ExchangeInfo|null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", passphrase: "" });
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<number|null>(null);
  const [error, setError] = useState("");

  const fetchData = async () => {
    const [c, a] = await Promise.all([fetch("/api/exchanges").then(r=>r.json()), fetch("/api/exchanges/available").then(r=>r.json())]);
    setConnected(c); setAvailable(a);
  };
  useEffect(() => { fetchData(); }, []);

  const getInfo = (slug: string) => available.find(e => e.id === slug);
  const getCategoryForConnected = (ex: ConnectedExchange): AccountCategory => {
    const info = getInfo(ex.slug);
    return info?.category || "exchange";
  };

  const openWizard = (cat: AccountCategory) => {
    setWizardCategory(cat);
    setShowWizard(true);
    setSelected(null);
    setSearch("");
    setError("");
  };

  const wizardFiltered = available
    .filter(e => !wizardCategory || e.category === wizardCategory)
    .filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.tags.some(t => t.includes(search.toLowerCase())));

  const handleConnect = async () => {
    if (!selected) return; setTesting(true); setError("");
    try {
      const res = await fetch("/api/exchanges", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ slug: selected.id, apiKey: form.apiKey||undefined, apiSecret: form.apiSecret||undefined, passphrase: form.passphrase||undefined }) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setShowWizard(false); setSelected(null); setWizardCategory(null); setForm({ apiKey:"", apiSecret:"", passphrase:"" }); fetchData();
    } catch(e:any) { setError(e.message); } finally { setTesting(false); }
  };
  const handleSync = async (id: number) => { setSyncing(id); try { await fetch(`/api/exchanges/${id}/sync`, {method:"POST"}); fetchData(); } finally { setSyncing(null); } };
  const handleDelete = async (id: number) => { if (!confirm("Remove this account?")) return; await fetch("/api/exchanges", {method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}); fetchData(); };

  const connectedByCategory = categoryOrder.map(cat => ({
    category: cat,
    items: connected.filter(ex => getCategoryForConnected(ex) === cat),
  })).filter(g => g.items.length > 0);

  const hasAny = connected.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted mt-1">Manage your exchanges, brokers, banks & wallets</p>
      </div>

      {/* Category action bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categoryOrder.map(cat => {
          const cfg = categoryConfig[cat];
          const Icon = cfg.icon;
          const count = connected.filter(ex => getCategoryForConnected(ex) === cat).length;
          return (
            <button key={cat} onClick={() => openWizard(cat)}
              className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-accent/30 transition-colors text-left group">
              <div className={`w-10 h-10 rounded-lg bg-card flex items-center justify-center border border-border group-hover:border-accent/30`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium group-hover:text-accent transition-colors">Add {cfg.label}</div>
                <div className="text-xs text-muted">{count} connected</div>
              </div>
              <Plus className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
            </button>
          );
        })}
      </div>

      {/* Connected accounts grouped by category */}
      {hasAny ? (
        <div className="space-y-6">
          {connectedByCategory.map(({ category, items }) => {
            const cfg = categoryConfig[category];
            const Icon = cfg.icon;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                  <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">{cfg.plural}</h2>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(ex => {
                    const info = getInfo(ex.slug);
                    return (
                      <div key={ex.id} onClick={() => router.push(`/exchanges/${ex.id}`)} className="bg-card border border-border rounded-xl p-5 hover:border-accent/30 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <ExchangeLogo name={ex.name} logo={info?.logo} size={40} />
                            <div>
                              <h3 className="font-semibold">{ex.name}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.tagColor}`}>{cfg.label}</span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {ex.type==="auto" && <button onClick={(e)=>{e.stopPropagation();handleSync(ex.id);}} className="p-2 hover:bg-[var(--hover-bg)] rounded-lg transition-colors" title="Sync"><RefreshCw className={`w-4 h-4 text-muted ${syncing===ex.id?"animate-spin":""}`}/></button>}
                            <button onClick={(e)=>{e.stopPropagation();handleDelete(ex.id);}} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors" title="Remove"><Trash2 className="w-4 h-4 text-destructive/70"/></button>
                          </div>
                        </div>
                        <div className="text-sm space-y-2">
                          {ex.type==="auto" && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted">API Key</span>
                              {ex.hasApiKey ? <span className="flex items-center gap-1 text-accent"><Check className="w-3.5 h-3.5"/> Connected</span> : <span className="flex items-center gap-1 text-muted-foreground"><X className="w-3.5 h-3.5"/> None</span>}
                            </div>
                          )}
                          {ex.lastSync && <div className="flex items-center justify-between"><span className="text-muted">Last sync</span><span className="text-xs text-muted">{new Date(ex.lastSync).toLocaleString()}</span></div>}
                        </div>
                        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-accent font-medium">
                          <span>View details & import</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border border-dashed rounded-xl p-12 text-center">
          <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted font-medium">No accounts connected</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first exchange, broker, or bank to start tracking</p>
        </div>
      )}

      {/* Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>{setShowWizard(false);setSelected(null);setWizardCategory(null);setError("");setSearch("");}}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            {!selected ? (
              <div className="p-6">
                <h2 className="text-lg font-bold mb-1">
                  Add {wizardCategory ? categoryConfig[wizardCategory].label : "Account"}
                </h2>
                <p className="text-sm text-muted mb-4">
                  {wizardCategory === "exchange" && "Connect a crypto exchange via API"}
                  {wizardCategory === "broker" && "Add a broker to import your investments"}
                  {wizardCategory === "bank" && "Add a bank to track expenses"}
                  {wizardCategory === "wallet" && "Add a wallet for manual tracking"}
                  {!wizardCategory && "Choose a service to connect"}
                </p>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <input type="text" placeholder={`Search ${wizardCategory ? categoryConfig[wizardCategory].plural.toLowerCase() : "all"}...`} value={search} onChange={e=>setSearch(e.target.value)} autoFocus
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent placeholder:text-muted-foreground" />
                </div>
                <div className="space-y-0.5 max-h-[50vh] overflow-auto -mx-2 px-2">
                  {wizardFiltered.map(ex => {
                    const cfg = categoryConfig[ex.category];
                    return (
                      <button key={ex.id} onClick={()=>setSelected(ex)}
                        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[var(--hover-bg)] rounded-lg text-sm text-left transition-colors group">
                        <ExchangeLogo name={ex.name} logo={ex.logo} size={28} />
                        <span className="font-medium flex-1 group-hover:text-accent transition-colors">{ex.name}</span>
                        {ex.importFormat && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400 uppercase font-mono">{ex.importFormat}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.tagColor}`}>{cfg.label}</span>
                      </button>
                    );
                  })}
                  {wizardFiltered.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">Nothing found</div>}
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ExchangeLogo name={selected.name} logo={selected.logo} size={40} />
                  <div>
                    <h2 className="text-lg font-bold">Connect {selected.name}</h2>
                    <p className="text-sm text-muted">
                      {selected.type==="auto" ? "Enter your read-only API credentials" :
                       selected.importFormat ? `Import via ${selected.importFormat.toUpperCase()} file` :
                       "Manual account — no API needed"}
                    </p>
                  </div>
                </div>
                {selected.type==="auto" && (
                  <>
                    <div className="flex items-start gap-2 p-3 bg-accent/10 border border-accent/20 rounded-lg mb-5">
                      <Shield className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                      <p className="text-xs text-accent">Only enable <strong>read</strong> permissions. Never grant trading or withdrawal access.</p>
                    </div>
                    <div className="space-y-4">
                      <div><label className="text-sm font-medium text-muted mb-1.5 block">API Key</label>
                        <input type="password" value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent" placeholder="Enter API key" /></div>
                      <div><label className="text-sm font-medium text-muted mb-1.5 block">API Secret</label>
                        <input type="password" value={form.apiSecret} onChange={e=>setForm({...form,apiSecret:e.target.value})}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent" placeholder="Enter API secret" /></div>
                      {selected.requiresPassphrase && <div><label className="text-sm font-medium text-muted mb-1.5 block">Passphrase</label>
                        <input type="password" value={form.passphrase} onChange={e=>setForm({...form,passphrase:e.target.value})}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent" placeholder="Enter passphrase" /></div>}
                    </div>
                  </>
                )}
                {error && <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>}
                <div className="flex gap-3 mt-6">
                  <button onClick={()=>{setSelected(null);setError("");}} className="px-4 py-2.5 bg-background hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors">Back</button>
                  <button onClick={handleConnect} disabled={testing} className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                    {testing ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
