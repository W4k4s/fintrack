// Strategy V2 Refactor R3 — helpers puros para el cálculo del multiplier
// F&G policy-aware usado por /api/strategy/market y el endpoint /schedule.
// Extraído para testabilidad (market/route.ts tenía la lógica inline).

import type { StrategyPolicies } from "./policies";

export interface RawMultiplier {
  multiplier: number;
  label: string;
}

/**
 * Multiplier crudo basado SOLO en F&G. Usa el threshold de la policy para el
 * tramo inferior (antes hardcoded a 24). Los demás tramos se mantienen.
 */
export function getRawDcaMultiplier(fg: number, fgThreshold: number): RawMultiplier {
  if (fg <= fgThreshold) return { multiplier: 2.0, label: "Doblar compras (miedo extremo)" };
  if (fg <= 44) return { multiplier: 1.5, label: "Aumentar (miedo)" };
  if (fg <= 55) return { multiplier: 1.0, label: "Ritmo normal" };
  if (fg <= 74) return { multiplier: 0.75, label: "Reducir (codicia)" };
  return { multiplier: 0.5, label: "Tomar beneficios (codicia extrema)" };
}

/**
 * Aplica los gates de policy:
 *  - Si la allocation crypto ≥ requiresCryptoUnderPct → pausa total (1.0).
 *  - Si el multiplier es >1.0 y appliesTo restringe a subset → añade hint
 *    al label pero NO baja el valor (el boost sigue aplicando a los assets
 *    del subset; quién consume el valor debe diferenciar por asset).
 */
export function applyPolicyGate(
  raw: RawMultiplier,
  policies: StrategyPolicies,
  cryptoAllocationPct: number,
): RawMultiplier {
  if (cryptoAllocationPct >= policies.multiplier.requiresCryptoUnderPct) {
    return {
      multiplier: 1.0,
      label: `Pausado (crypto ${cryptoAllocationPct.toFixed(1)}% ≥ ${policies.multiplier.requiresCryptoUnderPct}%)`,
    };
  }
  if (raw.multiplier > 1.0 && policies.multiplier.appliesTo.length > 0) {
    const assets = policies.multiplier.appliesTo.join(", ");
    return { ...raw, label: `${raw.label} — sólo ${assets}` };
  }
  return raw;
}

// Set de símbolos considerados crypto en UI/schedule. Se replica el mapping
// de src/app/api/strategy/health/route.ts ASSET_CLASS_MAP (más conservador,
// no incluye "other").
export const CRYPTO_SYMBOLS = new Set<string>([
  "BTC", "ETH", "SOL", "PEPE", "XCH", "SHIB", "BNB", "ROSE", "MANA", "S", "GPU",
]);

export interface PortfolioAssetLike {
  symbol: string;
  value?: number;
}

/**
 * Suma el valor de los assets crypto del portfolio y devuelve el %
 * sobre totalPortfolio. Si totalPortfolio = 0, devuelve 0.
 */
export function computeCryptoAllocationPct(
  portfolioAssets: PortfolioAssetLike[],
  totalPortfolio: number,
): number {
  if (!Number.isFinite(totalPortfolio) || totalPortfolio <= 0) return 0;
  const cryptoValue = portfolioAssets
    .filter((a) => CRYPTO_SYMBOLS.has(a.symbol))
    .reduce((s, a) => s + (a.value ?? 0), 0);
  return (cryptoValue / totalPortfolio) * 100;
}
