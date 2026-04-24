// Tipos compartidos servidor↔cliente del payload de /api/strategy/schedule.
// Vivían en src/components/strategy/types.ts; los movemos aquí para que
// buildSchedule (server) y la UI consuman el mismo shape sin que cada
// vista reimplemente derivaciones.

import type { AssetClass } from "@/lib/intel/allocation/classify";

export interface WeekItem {
  label: string;
  start: string;
  end: string;
  target: number;
  executed: number;
  done: boolean;
  autoDone?: boolean;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

export interface ScheduleMultiplierComponents {
  fgMult?: number;
  fundingBoost?: number;
  fundingRate?: number | null;
  basisBoost?: number;
  basisPct?: number | null;
  vixLevel?: number | null;
  gated?: "crypto_paused" | "asset_not_in_scope";
  gateContext?: Record<string, unknown>;
}

// Un ScheduleItem lleva:
// - los campos "crudos" que salían antes del route (asset, multiplier, weeks…)
// - los campos DERIVADOS que antes recalculaba cada cliente
//   (autoPending, monthRemaining, displayAmount, done unificado,
//   pauseReason, actionLabel). Ahora vienen del servidor ya resueltos.
export interface ScheduleItem {
  planId: number;
  asset: string;
  assetClass: AssetClass | string;
  name: string;
  isCrypto: boolean;

  // Multiplicador aplicado
  baseMonthly: number;
  monthlyTarget: number;
  weeklyTarget: number;
  appliedMultiplier: number;
  multiplierRule: "crypto" | "equity" | "fixed";
  multiplierComponents: ScheduleMultiplierComponents;

  // Plan auto-DCA
  autoExecute: boolean;
  autoDayOfWeek: number | null;
  autoStartDate: string | null;
  broker: string | null;

  // Progreso del mes
  totalExecuted: number;
  remaining: number;
  monthRemaining: number;
  onTrack: boolean;
  weeks: WeekItem[];

  // Derivaciones (antes cliente, ahora servidor)
  autoPending: boolean;          // plan con autoExecute pero autoStartDate aún futuro: arranca en modo "manual hasta X"
  displayAmount: number;         // autoPending ? monthRemaining : weeklyTarget
  done: boolean;                 // autoPending ? monthRemaining === 0 : currentWeek.done
  pauseReason: "crypto_paused" | "asset_not_in_scope" | null;
  actionLabel: string;           // copy resuelto para el botón/etiqueta principal
}

export interface ScheduleMarketContext {
  fg: number;
  btcFunding: number | null;
  ethFunding: number | null;
  vixLevel: number | null;
  vixChangePct: number | null;
  basisBtcPct: number | null;
  basisBtcDaysToExpiry: number | null;
}

export interface ScheduleData {
  currentWeek: number;
  totalWeeks: number;
  weeklyBudget: number;
  thisWeekExecuted: number;
  thisWeekRemaining: number;
  fgValue: number;
  marketContext: ScheduleMarketContext;
  schedule: ScheduleItem[];
  weeks: { label: string; start: string; end: string; isCurrent: boolean }[];
}
