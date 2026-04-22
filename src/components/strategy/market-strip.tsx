"use client";
import { usePrivacy } from "@/components/privacy-provider";
import type { MarketData } from "./types";

export function MarketStrip({ market, netWorth }: { market: MarketData | null; netWorth: number }) {
  const { mask } = usePrivacy();
  if (!market) return null;
  const fg = market.fearGreed.value;
  const fgColor = fg <= 24 ? "text-danger" : fg <= 44 ? "text-warn" :
    fg <= 55 ? "text-foreground" : fg <= 74 ? "text-success" : "text-danger";
  const multColor = market.dcaMultiplier.value >= 1.5 ? "text-success" :
    market.dcaMultiplier.value >= 1 ? "text-foreground" : "text-warn";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Miedo / Codicia</div>
        <div className={`text-3xl font-bold tabular-nums ${fgColor}`}>{fg}</div>
        <div className={`text-xs ${fgColor}`}>{market.fearGreed.label}</div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ritmo sugerido</div>
        <div className={`text-3xl font-bold tabular-nums ${multColor}`}>×{market.dcaMultiplier.value}</div>
        <div className={`text-xs ${multColor}`}>{market.dcaMultiplier.label}</div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ahorro mensual</div>
        <div className="text-3xl font-bold tabular-nums text-foreground">{market.finances.savingsRate}%</div>
        <div className="text-xs text-muted-foreground">{mask(`€${market.finances.monthlyInvestable.toLocaleString("es-ES")}`)}/mes disponible</div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Patrimonio</div>
        <div className="text-3xl font-bold tabular-nums text-foreground">{mask(`€${netWorth.toLocaleString("es-ES")}`)}</div>
        <div className="text-xs text-muted-foreground">Portfolio + banco</div>
      </div>
    </div>
  );
}
