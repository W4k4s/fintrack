"use client";
import { useState, useEffect } from "react";
import { Settings, Download, Moon, Sun, Monitor } from "lucide-react";

export default function SettingsPage() {
  const [theme, setTheme] = useState<"dark"|"light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("fintrack-theme") || "dark";
    setTheme(saved as "dark"|"light");
    document.documentElement.className = saved === "light" ? "light" : "dark";
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("fintrack-theme", next);
    document.documentElement.className = next === "light" ? "light" : "dark";
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6"/> Settings</h1>
        <p className="text-sm text-muted mt-1">Configure your FinTrack experience</p>
      </div>

      <div className="space-y-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Appearance</h2>
          <p className="text-sm text-muted mb-4">Choose your preferred theme</p>
          <div className="flex gap-3">
            <button onClick={() => { setTheme("dark"); localStorage.setItem("fintrack-theme","dark"); document.documentElement.className="dark"; }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${theme==="dark" ? "bg-accent/15 border-accent text-accent" : "bg-background border-border text-muted hover:text-foreground"}`}>
              <Moon className="w-4 h-4"/> Dark
            </button>
            <button onClick={() => { setTheme("light"); localStorage.setItem("fintrack-theme","light"); document.documentElement.className="light"; }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${theme==="light" ? "bg-accent/15 border-accent text-accent" : "bg-background border-border text-muted hover:text-foreground"}`}>
              <Sun className="w-4 h-4"/> Light
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Data</h2>
          <p className="text-sm text-muted mb-4">Export or manage your portfolio data</p>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 bg-background hover:bg-[var(--hover-bg)] border border-border rounded-lg text-sm font-medium transition-colors">
            <Download className="w-4 h-4"/> Export All Data (JSON)
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-1">About</h2>
          <div className="text-sm text-muted space-y-1 mt-3">
            <div>FinTrack v0.1.0</div>
            <div>Local-first portfolio tracker</div>
            <div><a href="https://github.com/W4k4s/fintrack" target="_blank" className="text-accent hover:underline">GitHub Repository</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
