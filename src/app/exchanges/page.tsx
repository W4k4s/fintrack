"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Plus, Trash2, RefreshCw, Check, X, Search, Shield } from "lucide-react";
import { ExchangeLogo } from "@/components/exchange-logo";

interface ExchangeInfo { id: string; name: string; logo: string; type: "auto"|"manual"; requiresPassphrase: boolean; tags: string[]; }
interface ConnectedExchange { id: number; name: string; slug: string; type: string; enabled: boolean; lastSync: string|null; hasApiKey: boolean; }

export default function ExchangesPage() {
  const router = useRouter();
  const [connected, setConnected] = useState<ConnectedExchange[]>([]);
  const [available, setAvailable] = useState<ExchangeInfo[]>([]);
  const [showWizard, setShowWizard] = useState(false);
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

  const filtered = available.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.tags.some(t => t.includes(search.toLowerCase())));
  const getInfo = (slug: string) => available.find(e => e.id === slug);

  const handleConnect = async () => {
    if (!selected) return; setTesting(true); setError("");
    try {
      const res = await fetch("/api/exchanges", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ slug: selected.id, apiKey: form.apiKey||undefined, apiSecret: form.apiSecret||undefined, passphrase: form.passphrase||undefined }) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setShowWizard(false); setSelected(null); setForm({ apiKey:"", apiSecret:"", passphrase:"" }); fetchData();
    } catch(e:any) { setError(e.message); } finally { setTesting(false); }
  };
  const handleSync = async (id: number) => { setSyncing(id); try { await fetch(`/api/exchanges/${id}/sync`, {method:"POST"}); fetchData(); } finally { setSyncing(null); } };
  const handleDelete = async (id: number) => { if (!confirm("Remove?")) return; await fetch("/api/exchanges", {method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}); fetchData(); };

  const tagColors: Record<string,string> = { cex: "bg-blue-500/15 text-blue-400", dex: "bg-purple-500/15 text-purple-400", hardware: "bg-amber-500/15 text-amber-400", wallet: "bg-cyan-500/15 text-cyan-400", broker: "bg-emerald-500/15 text-emerald-400", bank: "bg-green-500/15 text-green-400", manual: "bg-zinc-500/15 text-zinc-400" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight className="w-6 h-6"/> Exchanges</h1>
          <p className="text-sm text-muted mt-1">Manage your connected accounts</p>
        </div>
        <button onClick={()=>{setShowWizard(true);setSelected(null);}} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4"/> Add Exchange
        </button>
      </div>

      {connected.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connected.map(ex => {
            const info = getInfo(ex.slug);
            return (
              <div key={ex.id} onClick={() => router.push(`/exchanges/${ex.id}`)} className="bg-card border border-border rounded-xl p-5 hover:border-accent/30 transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ExchangeLogo name={ex.name} logo={info?.logo} size={40} />
                    <div>
                      <h3 className="font-semibold">{ex.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColors[info?.tags[0] || "manual"] || tagColors.manual}`}>{info?.tags[0] || "manual"}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {ex.type==="auto" && <button onClick={(e)=>{e.stopPropagation();handleSync(ex.id);}} className="p-2 hover:bg-[var(--hover-bg)] rounded-lg transition-colors" title="Sync"><RefreshCw className={`w-4 h-4 text-muted ${syncing===ex.id?"animate-spin":""}`}/></button>}
                    <button onClick={(e)=>{e.stopPropagation();handleDelete(ex.id);}} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors" title="Remove"><Trash2 className="w-4 h-4 text-destructive/70"/></button>
                  </div>
                </div>
                <div className="text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">API Key</span>
                    {ex.hasApiKey ? <span className="flex items-center gap-1 text-accent"><Check className="w-3.5 h-3.5"/> Connected</span> : <span className="flex items-center gap-1 text-muted-foreground"><X className="w-3.5 h-3.5"/> None</span>}
                  </div>
                  {ex.lastSync && <div className="flex items-center justify-between"><span className="text-muted">Last sync</span><span className="text-xs text-muted">{new Date(ex.lastSync).toLocaleString()}</span></div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border border-dashed rounded-xl p-12 text-center">
          <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted font-medium">No exchanges connected</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first exchange to start tracking your portfolio</p>
        </div>
      )}

      {/* Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>{setShowWizard(false);setSelected(null);setError("");setSearch("");}}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            {!selected ? (
              <div className="p-6">
                <h2 className="text-lg font-bold mb-1">Add Exchange</h2>
                <p className="text-sm text-muted mb-4">Choose an exchange or service to connect</p>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <input type="text" placeholder="Search exchanges..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent placeholder:text-muted-foreground" />
                </div>
                <div className="space-y-0.5 max-h-[50vh] overflow-auto -mx-2 px-2">
                  {filtered.map(ex => (
                    <button key={ex.id} onClick={()=>setSelected(ex)}
                      className="w-full flex items-center gap-3 px-3 py-3 hover:bg-[var(--hover-bg)] rounded-lg text-sm text-left transition-colors group">
                      <ExchangeLogo name={ex.name} logo={ex.logo} size={28} />
                      <span className="font-medium flex-1 group-hover:text-accent transition-colors">{ex.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColors[ex.tags[0]] || tagColors.manual}`}>{ex.tags[0]}</span>
                    </button>
                  ))}
                  {filtered.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">No exchanges found</div>}
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ExchangeLogo name={selected.name} logo={selected.logo} size={40} />
                  <div>
                    <h2 className="text-lg font-bold">Connect {selected.name}</h2>
                    <p className="text-sm text-muted">{selected.type==="auto"?"Enter your read-only API credentials":"Manual account — no API needed"}</p>
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
