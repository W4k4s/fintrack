"use client";
import { Shield } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import type { HealthData } from "./types";

export function EmergencyCard({ emergency }: { emergency: HealthData["emergency"] }) {
  const { mask } = usePrivacy();
  const pct = emergency.target > 0 ? Math.min(100, Math.round((emergency.current / emergency.target) * 100)) : 0;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className={`w-4 h-4 ${emergency.ok ? "text-success" : "text-danger"}`} />
          Fondo de emergencia
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          emergency.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
        }`}>{emergency.ok ? "OK" : "Insuficiente"}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold tabular-nums text-foreground">{mask(`€${emergency.current.toLocaleString("es-ES")}`)}</span>
        <span className="text-muted-foreground tabular-nums">/ {mask(`€${emergency.target.toLocaleString("es-ES")}`)}</span>
      </div>
      <div className="h-2.5 bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${emergency.ok ? "bg-success" : "bg-danger"}`}
          style={{ width: `${pct}%` }} />
      </div>
      {emergency.surplus > 0 && (
        <div className="mt-3 text-xs bg-success-soft text-success rounded-lg px-3 py-2">
          💰 Tienes <b className="tabular-nums">{mask(`€${emergency.surplus.toLocaleString("es-ES")}`)}</b> de cash extra que puedes invertir.
        </div>
      )}
    </div>
  );
}
