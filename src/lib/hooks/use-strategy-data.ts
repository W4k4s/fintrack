"use client";

// SWR-backed hooks for the strategy data family. Todos los endpoints
// comparten un fetcher común, keys estables y una función global de
// invalidación para que tras una mutación (DCA execute, edit profile,
// plans CRUD...) las 4 vistas (home, /strategy, /guide, /plans) se
// refresquen sin recargar la página.

import useSWR, { type SWRConfiguration, useSWRConfig } from "swr";
import type { DashboardSummary } from "@/lib/dashboard/summary";
import type { ScheduleData } from "@/lib/strategy/types";

// -- fetcher + keys --------------------------------------------------------

async function jsonFetcher<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

export const KEYS = {
  dashboard: "/api/dashboard/summary",
  schedule: "/api/strategy/schedule",
  health: "/api/strategy/health",
  market: "/api/strategy/market",
  strategy: "/api/strategy",
  plans: "/api/plans",
  subTargets: "/api/strategy/sub-targets",
  assets: "/api/assets",
  portfolioSnapshot: "/api/portfolio/snapshot",
} as const;

// Keys que cualquier mutación relacionada con strategy/plans/ejecuciones
// debería invalidar para evitar vistas stale.
const STRATEGY_KEYS: readonly string[] = [
  KEYS.dashboard,
  KEYS.schedule,
  KEYS.health,
  KEYS.market,
  KEYS.strategy,
  KEYS.plans,
  KEYS.subTargets,
  KEYS.assets,
  KEYS.portfolioSnapshot,
];

const SHARED_CONFIG: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 2_000,
};

// -- hooks ------------------------------------------------------------------

export function useDashboardSummary() {
  return useSWR<DashboardSummary>(KEYS.dashboard, jsonFetcher, SHARED_CONFIG);
}

export function useSchedule() {
  return useSWR<ScheduleData>(KEYS.schedule, jsonFetcher, SHARED_CONFIG);
}

export function useStrategyHealth<T = unknown>() {
  return useSWR<T>(KEYS.health, jsonFetcher, SHARED_CONFIG);
}

export function useStrategyMarket<T = unknown>() {
  return useSWR<T>(KEYS.market, jsonFetcher, SHARED_CONFIG);
}

export function useStrategyFull<T = unknown>() {
  return useSWR<T>(KEYS.strategy, jsonFetcher, SHARED_CONFIG);
}

export function usePlans<T = unknown>() {
  return useSWR<T>(KEYS.plans, jsonFetcher, SHARED_CONFIG);
}

export function useSubTargets<T = unknown>() {
  return useSWR<T>(KEYS.subTargets, jsonFetcher, SHARED_CONFIG);
}

// -- mutate global ----------------------------------------------------------

// Hook para disparar refetch de todas las vistas strategy tras una mutación.
// Uso típico:
//   const invalidate = useInvalidateStrategyViews();
//   await fetch("/api/strategy/execute", { ... });
//   invalidate();
export function useInvalidateStrategyViews() {
  const { mutate } = useSWRConfig();
  return () => {
    for (const key of STRATEGY_KEYS) mutate(key);
  };
}
