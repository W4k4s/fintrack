"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Plus, Trash2, Pause, Play } from "lucide-react";

interface Plan { id: number; name: string; asset: string; amount: number; frequency: string; nextExecution: string|null; enabled: boolean; }

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", asset: "", amount: "", frequency: "monthly" });

  const fetchPlans = () => fetch("/api/plans").then(r=>r.json()).then(setPlans);
  useEffect(() => { fetchPlans(); }, []);

  const handleCreate = async () => {
    await fetch("/api/plans", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) });
    setForm({ name:"", asset:"", amount:"", frequency:"monthly" }); setShowForm(false); fetchPlans();
  };
  const handleToggle = async (plan: Plan) => {
    await fetch("/api/plans", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: plan.id, enabled: !plan.enabled }) });
    fetchPlans();
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this plan?")) return;
    await fetch("/api/plans", { method: "DELETE", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id }) }); fetchPlans();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarClock className="w-6 h-6"/> DCA Plans</h1>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium"><Plus className="w-4 h-4"/> New Plan</button>
      </div>

      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Plan name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <input placeholder="Asset (BTC, ETH...)" value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <input placeholder="Amount (USD)" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500"/>
            <select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-emerald-500">
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
            </select>
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium">Create Plan</button>
        </div>
      )}

      {plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map(p => (
            <div key={p.id} className={`bg-zinc-900 border rounded-xl p-4 ${p.enabled?"border-zinc-800":"border-zinc-800/50 opacity-60"}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{p.name}</h3>
                <div className="flex gap-1">
                  <button onClick={()=>handleToggle(p)} className="p-1.5 hover:bg-zinc-800 rounded-lg">{p.enabled?<Pause className="w-4 h-4"/>:<Play className="w-4 h-4"/>}</button>
                  <button onClick={()=>handleDelete(p.id)} className="p-1.5 hover:bg-red-900/50 text-red-500 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              <div className="text-sm text-zinc-400 space-y-1">
                <div>Asset: <span className="text-white">{p.asset}</span></div>
                <div>Amount: <span className="text-emerald-500">${p.amount}</span> / {p.frequency}</div>
                {p.nextExecution && <div>Next: {new Date(p.nextExecution).toLocaleDateString()}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">No investment plans yet.</div>}
    </div>
  );
}
