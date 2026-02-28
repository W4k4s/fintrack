"use client";
import { useState } from "react";
import { Settings, Download, Moon, Sun } from "lucide-react";

export default function SettingsPage() {
  const [theme, setTheme] = useState<"dark"|"light">("dark");

  const handleExport = async () => {
    const [exchanges, assets, plans, txs] = await Promise.all([
      fetch("/api/exchanges").then(r=>r.json()),
      fetch("/api/assets").then(r=>r.json()),
      fetch("/api/plans").then(r=>r.json()),
      fetch("/api/transactions").then(r=>r.json()),
    ]);
    const data = { exportDate: new Date().toISOString(), exchanges, assets, plans, transactions: txs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `fintrack-export-${new Date().toISOString().split("T")[0]}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6"/> Settings</h1>

      <div className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3">Appearance</h2>
          <button onClick={toggleTheme} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
            {theme === "dark" ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
            Switch to {theme === "dark" ? "Light" : "Dark"} Mode
          </button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3">Data</h2>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
            <Download className="w-4 h-4"/> Export All Data (JSON)
          </button>
          <p className="text-xs text-zinc-500 mt-2">Downloads all your exchanges, assets, plans, and transactions.</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3">About</h2>
          <div className="text-sm text-zinc-400 space-y-1">
            <div>FinTrack v0.1.0</div>
            <div>Local-first portfolio tracker</div>
            <div><a href="https://github.com/W4k4s/fintrack" target="_blank" className="text-emerald-500 hover:underline">GitHub Repository</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
