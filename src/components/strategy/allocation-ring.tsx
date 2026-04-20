"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, ArrowUp, ArrowDown, CheckCircle2 } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";
import { usePrivacy } from "@/components/privacy-provider";
import { cn } from "@/lib/utils";

export interface Allocation {
  class: string;
  current: number;
  target: number;
  drift: number;
  currentValue: number;
  targetValue: number;
}

const CLASS_ICONS: Record<string, string> = {
  cash: "💶", etfs: "📈", crypto: "₿", gold: "🥇", bonds: "🏦", stocks: "📊",
};
const CLASS_LABELS: Record<string, string> = {
  cash: "Cash", etfs: "ETFs", crypto: "Crypto", gold: "Oro", bonds: "Bonos", stocks: "Acciones",
};

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
];

function driftTier(drift: number): "ok" | "warn" | "danger" {
  const abs = Math.abs(drift);
  if (abs > 15) return "danger";
  if (abs > 5) return "warn";
  return "ok";
}

const TIER_TEXT: Record<ReturnType<typeof driftTier>, string> = {
  ok: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};
const TIER_DOT: Record<ReturnType<typeof driftTier>, string> = {
  ok: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

export function AllocationRing({ allocation }: { allocation: Allocation[] }) {
  const { convert } = useCurrency();
  const { mask } = usePrivacy();
  const [hovered, setHovered] = useState<number | null>(null);

  const entries = allocation.filter(a => a.current > 0 || a.target > 0);
  const total = entries.reduce((s, a) => s + a.currentValue, 0);
  const sorted = [...entries].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  const actionable = sorted
    .filter(a => Math.abs(a.drift) > 5)
    .slice(0, 3)
    .map(a => ({
      class: a.class,
      direction: a.drift > 0 ? "sell" as const : "buy" as const,
      eur: Math.abs(a.currentValue - a.targetValue),
      drift: a.drift,
    }));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" /> Distribución actual
        </h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">vs objetivo</span>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-5">
        <div className="relative shrink-0">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie
                data={entries}
                dataKey="currentValue"
                nameKey="class"
                cx="50%" cy="50%"
                outerRadius={86}
                innerRadius={62}
                paddingAngle={2}
                cornerRadius={3}
                stroke="none"
                animationBegin={0}
                animationDuration={700}
                onMouseEnter={(_: unknown, i: number) => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {entries.map((_, i) => (
                  <Cell
                    key={i}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    style={{
                      filter: hovered === i ? "brightness(1.15)" : "none",
                      transition: "filter 0.18s var(--ease-standard)",
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: unknown) => mask(`€${Math.round(convert(Number(v))).toLocaleString("es-ES")}`)}
                labelFormatter={(label: unknown) => CLASS_LABELS[String(label)] || String(label)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-mono font-semibold tabular-nums">
              {mask(`€${Math.round(convert(total)).toLocaleString("es-ES")}`)}
            </span>
          </div>
        </div>

        <ul className="flex-1 w-full space-y-1">
          {sorted.map((item) => {
            const idx = entries.findIndex(e => e.class === item.class);
            const tier = driftTier(item.drift);
            const eur = Math.round(convert(item.currentValue));
            return (
              <li
                key={item.class}
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors",
                  hovered === idx && "bg-[var(--hover-bg)]",
                )}
              >
                <span
                  className="w-1.5 h-5 rounded-sm shrink-0"
                  style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
                />
                <span className="text-sm shrink-0">{CLASS_ICONS[item.class]}</span>
                <span className="text-xs text-foreground font-medium w-16 truncate">
                  {CLASS_LABELS[item.class] ?? item.class}
                </span>
                <div className="flex-1 text-[11px] font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground">{item.current}%</span>
                  <span className="mx-1 opacity-40">/</span>
                  <span>{item.target}%</span>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-20 text-right shrink-0">
                  {mask(`€${eur.toLocaleString("es-ES")}`)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-mono tabular-nums w-14 justify-end shrink-0",
                    TIER_TEXT[tier],
                  )}
                >
                  <span className={cn("w-1 h-1 rounded-full", TIER_DOT[tier])} />
                  {item.drift > 0 ? "+" : ""}{item.drift}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
            Rebalance sugerido
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            umbral ±5%
          </span>
        </div>
        {actionable.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Cartera dentro del rango. Sin rebalance necesario.</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {actionable.map((a) => {
              const eur = Math.round(convert(a.eur));
              const Arrow = a.direction === "buy" ? ArrowUp : ArrowDown;
              const tone = a.direction === "buy" ? "text-success" : "text-danger";
              return (
                <li key={a.class} className="flex items-center gap-2 text-xs">
                  <Arrow className={cn("w-3.5 h-3.5 shrink-0", tone)} />
                  <span className="text-foreground">
                    {a.direction === "buy" ? "Comprar" : "Reducir"}{" "}
                    <span className="font-medium">
                      {CLASS_LABELS[a.class] ?? a.class}
                    </span>
                  </span>
                  <span className="ml-auto font-mono tabular-nums text-muted-foreground">
                    {mask(`${a.direction === "buy" ? "+" : "−"}€${eur.toLocaleString("es-ES")}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
