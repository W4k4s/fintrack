"use client";
import { ShieldAlert } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import type { EmergencyFundStatus } from "@/lib/strategy/types";

// Banner rojo arriba de /strategy cuando el fondo de emergencia no está
// cubierto: todas las DCA quedan pausadas (mismo patrón que crypto_paused).
export function EmergencyPauseBanner({ emergencyFund }: { emergencyFund: EmergencyFundStatus | null | undefined }) {
  const { mask } = usePrivacy();
  if (!emergencyFund || emergencyFund.ok) return null;

  const pct = emergencyFund.targetEur > 0
    ? Math.round((emergencyFund.currentEur / emergencyFund.targetEur) * 100)
    : 0;

  return (
    <div className="bg-danger-soft border border-danger/40 rounded-xl p-4 md:p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-danger">
            Fondo de emergencia incompleto — DCA pausado
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Faltan <span className="font-semibold text-foreground tabular-nums">{mask(`€${emergencyFund.shortfallEur.toFixed(0)}`)}</span>
            {" para cubrir "}
            <span className="font-semibold text-foreground tabular-nums">{mask(`€${emergencyFund.targetEur.toFixed(0)}`)}</span>
            {" ("}{pct}% actual).
            {" Survival first: primero el colchón, luego volvemos a invertir."}
          </p>
        </div>
      </div>
    </div>
  );
}
