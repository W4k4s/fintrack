"use client";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus, Trash2, RefreshCw, Check, X, Search } from "lucide-react";

interface ExchangeInfo { id: string; name: string; type: "auto"|"manual"; requiresPassphrase: boolean; tags: string[]; }
interface ConnectedExchange { id: number; name: string; slug: string; type: string; enabled: boolean; lastSync: string|null; hasApiKey: boolean; }

export default function ExchangesPage() {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight className="w-6 h-6"/> Exchanges</h1>
        <button onClick={()=>{setShowWizard(true);setSelected(null);}} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium"><Plus className="w-4 h-4"/> Add Exchange</button>
      </div>
      {connected.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connected.map(ex => (
            <div key={ex.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">{ex.name}</h3>
                <div className="flex gap-1">
                  {ex.type==="auto" && <button onClick={()=>handleSync(ex.id)} className="p-1.5 hover:bg-zinc-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${syncing===ex.id?"animate-spin":""}`}/></button>}
                  <button onClick={()=>handleDelete(ex.id)} className="p-1.5 hover:bg-red-900/50 text-red-500 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              <div className="text-sm text-zinc-400 space-y-1">
                <div>Type: <span className="text-zinc-300 capitalize">{ex.type}</span></div>
                <div>API: {ex.hasApiKey ? <Check className="w-3 h-3 inline text-emerald-500"/> : <X className="w-3 h-3 inline text-zinc-600"/>}</div>
                {ex.lastSync && <div>Synced: {new Date(ex.lastSync).toLocaleString()}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">No exchanges connected. Click Add Exchange to start.</div>}

      {showWizard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-auto p-6">
            {!selected ? (<>
              <h2 className="text-lg font-bold mb-4">Select Exchange</h2>
              <div className="relative mb-4"><Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500"/>
                <input type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/></div>
              <div className="space-y-1 max-h-[50vh] overflow-auto">
                {filtered.map(ex => (<button key={ex.id} onClick={()=>setSelected(ex)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-800 rounded-lg text-sm text-left"><span className="font-medium">{ex.name}</span><span className="text-xs text-zinc-500 capitalize">{ex.tags[0]}</span></button>))}
              </div>
            </>) : (<>
              <h2 className="text-lg font-bold mb-1">Connect {selected.name}</h2>
              <p className="text-sm text-zinc-400 mb-4">{selected.type==="auto"?"Enter read-only API credentials.":"Manual account, no API needed."}</p>
              {selected.type==="auto" && <div className="space-y-3">
                <div><label className="text-sm text-zinc-400 mb-1 block">API Key</label><input type="password" value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/></div>
                <div><label className="text-sm text-zinc-400 mb-1 block">API Secret</label><input type="password" value={form.apiSecret} onChange={e=>setForm({...form,apiSecret:e.target.value})} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/></div>
                {selected.requiresPassphrase && <div><label className="text-sm text-zinc-400 mb-1 block">Passphrase</label><input type="password" value={form.passphrase} onChange={e=>setForm({...form,passphrase:e.target.value})} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/></div>}
              </div>}
              {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
              <div className="flex gap-3 mt-6">
                <button onClick={()=>{setSelected(null);setError("");}} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">Back</button>
                <button onClick={handleConnect} disabled={testing} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-sm font-medium">{testing?"Connecting...":"Connect"}</button>
              </div>
            </>)}
            <button onClick={()=>{setShowWizard(false);setSelected(null);setError("");setSearch("");}} className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
