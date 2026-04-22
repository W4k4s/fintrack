// Strategy V2 Refactor R1 — SSOT de las políticas de inversión.
// Fuente de verdad de los números que antes vivían hardcoded en el código
// (src/lib/intel/multipliers.ts, src/app/api/strategy/market/route.ts,
// src/app/strategy/guide/page.tsx). Se serializa como JSON en
// strategy_profiles.policies_json y se lee via parsePolicies con fallback
// defensivo — si el blob está corrupto, devolvemos DEFAULT_POLICIES_V2 en
// lectura (pero en escritura via PUT /api/strategy rechazamos con 400).
//
// Orígenes de los valores DEFAULT_POLICIES_V2:
// - crypto.pauseAbovePct=17 y fullBelowPct=15: decisión sesión 2026-04-20,
//   ver memory project_strategy_v2 §"Decisiones cerradas".
// - multiplier.fgThreshold=24 y appliesTo=["BTC"]: regla F&G ≤24 = ×2 sólo
//   BTC cuando la política de transición crypto lo permita.
// - thematic.maxPositionPct=3 y maxOpen=4: regla de posiciones temáticas
//   con tesis obligatoria (entry/target/stop/horizon).
// Cambios de estrategia se hacen en DB, no aquí — DEFAULT sólo aplica a
// deploys nuevos o backfill automático cuando el campo está NULL.

export interface CryptoPolicy {
  pauseAbovePct: number;
  btcOnlyBetween: [number, number];
  fullBelowPct: number;
}

export interface MultiplierPolicy {
  fgThreshold: number;
  appliesTo: string[];
  requiresCryptoUnderPct: number;
}

export interface ThematicPolicy {
  maxPositionPct: number;
  maxOpen: number;
  requireThesisFields: string[];
}

export interface StrategyPolicies {
  crypto: CryptoPolicy;
  multiplier: MultiplierPolicy;
  thematic: ThematicPolicy;
}

export const DEFAULT_POLICIES_V2: StrategyPolicies = {
  crypto: {
    pauseAbovePct: 17,
    btcOnlyBetween: [15, 17],
    fullBelowPct: 15,
  },
  multiplier: {
    fgThreshold: 24,
    appliesTo: ["BTC"],
    requiresCryptoUnderPct: 17,
  },
  thematic: {
    maxPositionPct: 3,
    maxOpen: 4,
    requireThesisFields: ["entryPrice", "targetPrice", "stopPrice", "timeHorizonMonths"],
  },
};

function isFinitePct(n: unknown, { min = 0, max = 100 }: { min?: number; max?: number } = {}): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
}

function validateCrypto(raw: unknown): { ok: true; value: CryptoPolicy } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "crypto: must be object" };
  const r = raw as Record<string, unknown>;
  if (!isFinitePct(r.pauseAbovePct)) return { ok: false, error: "crypto.pauseAbovePct must be 0..100" };
  if (!isFinitePct(r.fullBelowPct)) return { ok: false, error: "crypto.fullBelowPct must be 0..100" };
  if (!Array.isArray(r.btcOnlyBetween) || r.btcOnlyBetween.length !== 2) {
    return { ok: false, error: "crypto.btcOnlyBetween must be [low, high]" };
  }
  const [lo, hi] = r.btcOnlyBetween as unknown[];
  if (!isFinitePct(lo) || !isFinitePct(hi) || lo >= hi) {
    return { ok: false, error: "crypto.btcOnlyBetween entries must be 0..100 and low < high" };
  }
  return { ok: true, value: { pauseAbovePct: r.pauseAbovePct as number, btcOnlyBetween: [lo, hi], fullBelowPct: r.fullBelowPct as number } };
}

function validateMultiplier(raw: unknown): { ok: true; value: MultiplierPolicy } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "multiplier: must be object" };
  const r = raw as Record<string, unknown>;
  if (!isFinitePct(r.fgThreshold)) return { ok: false, error: "multiplier.fgThreshold must be 0..100" };
  if (!isNonEmptyStringArray(r.appliesTo)) return { ok: false, error: "multiplier.appliesTo must be non-empty string[]" };
  if (!isFinitePct(r.requiresCryptoUnderPct)) return { ok: false, error: "multiplier.requiresCryptoUnderPct must be 0..100" };
  return {
    ok: true,
    value: {
      fgThreshold: r.fgThreshold as number,
      appliesTo: r.appliesTo as string[],
      requiresCryptoUnderPct: r.requiresCryptoUnderPct as number,
    },
  };
}

function validateThematic(raw: unknown): { ok: true; value: ThematicPolicy } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "thematic: must be object" };
  const r = raw as Record<string, unknown>;
  if (!isFinitePct(r.maxPositionPct)) return { ok: false, error: "thematic.maxPositionPct must be 0..100" };
  if (typeof r.maxOpen !== "number" || !Number.isInteger(r.maxOpen) || r.maxOpen < 0) {
    return { ok: false, error: "thematic.maxOpen must be integer >= 0" };
  }
  if (!isNonEmptyStringArray(r.requireThesisFields)) {
    return { ok: false, error: "thematic.requireThesisFields must be non-empty string[]" };
  }
  return {
    ok: true,
    value: {
      maxPositionPct: r.maxPositionPct as number,
      maxOpen: r.maxOpen,
      requireThesisFields: r.requireThesisFields as string[],
    },
  };
}

export function validatePolicies(raw: unknown): { ok: true; value: StrategyPolicies } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "policies must be object" };
  const r = raw as Record<string, unknown>;
  const crypto = validateCrypto(r.crypto);
  if (!crypto.ok) return crypto;
  const multiplier = validateMultiplier(r.multiplier);
  if (!multiplier.ok) return multiplier;
  const thematic = validateThematic(r.thematic);
  if (!thematic.ok) return thematic;
  return { ok: true, value: { crypto: crypto.value, multiplier: multiplier.value, thematic: thematic.value } };
}

/**
 * Parse + validate tolerant. Usado al LEER la DB: si el blob es null, vacío,
 * JSON malformado o no pasa validación, devuelve DEFAULT_POLICIES_V2 y loguea
 * warning. NUNCA lanza — evita romper requests por un campo corrupto.
 *
 * Para escritura (PUT /api/strategy) usar `validatePolicies` directamente y
 * devolver 400 si no valida.
 */
export function parsePolicies(raw: string | null | undefined): StrategyPolicies {
  if (raw == null || raw === "") return DEFAULT_POLICIES_V2;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[policies] parsePolicies: JSON.parse failed, using defaults", err);
    return DEFAULT_POLICIES_V2;
  }
  const result = validatePolicies(parsed);
  if (!result.ok) {
    console.warn(`[policies] parsePolicies: validation failed (${result.error}), using defaults`);
    return DEFAULT_POLICIES_V2;
  }
  return result.value;
}

export function serializePolicies(p: StrategyPolicies): string {
  return JSON.stringify(p);
}
