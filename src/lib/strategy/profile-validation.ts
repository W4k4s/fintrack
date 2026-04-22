// Strategy V2 Refactor R1 — validación pura del PUT /api/strategy.
// Separado en módulo para testabilidad (el repo testea lógica pura, no
// endpoints HTTP). Rechaza policies_json malformado con error explícito
// en vez de silenciar a DEFAULT_POLICIES_V2 (eso sólo aplica en lectura).

import { validatePolicies } from "./policies";

export type ProfileUpdate = Partial<{
  id: number;
  name: string;
  riskProfile: "conservative" | "balanced" | "growth" | "aggressive";
  targetCash: number;
  targetEtfs: number;
  targetCrypto: number;
  targetGold: number;
  targetBonds: number;
  targetStocks: number;
  monthlyInvest: number;
  emergencyMonths: number;
  active: boolean;
  notes: string | null;
  tagline: string | null;
  philosophy: string | null;
  policiesJson: string | null;
  monthlyFixedExpenses: number;
}>;

export type ValidateResult =
  | { ok: true; value: ProfileUpdate }
  | { ok: false; error: string };

const RISK_PROFILES = ["conservative", "balanced", "growth", "aggressive"] as const;

function nonNegativeFinite(n: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${field} debe ser un número >= 0` };
  }
  return { ok: true, value: n };
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

/**
 * Valida el body de un PUT /api/strategy. Devuelve el subset aceptado
 * (ignora campos desconocidos) o un error. NO aplica defaults — sólo
 * sanity checks de tipos y rangos.
 */
export function validateProfileUpdate(raw: unknown): ValidateResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "body debe ser objeto" };
  }
  const b = raw as Record<string, unknown>;
  const out: ProfileUpdate = {};

  if (typeof b.id === "number" && Number.isInteger(b.id)) out.id = b.id;

  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.length === 0) {
      return { ok: false, error: "name debe ser string no vacío" };
    }
    out.name = b.name;
  }

  if (b.riskProfile !== undefined) {
    if (typeof b.riskProfile !== "string" || !RISK_PROFILES.includes(b.riskProfile as typeof RISK_PROFILES[number])) {
      return { ok: false, error: "riskProfile inválido" };
    }
    out.riskProfile = b.riskProfile as ProfileUpdate["riskProfile"];
  }

  for (const field of ["targetCash", "targetEtfs", "targetCrypto", "targetGold", "targetBonds", "targetStocks"] as const) {
    if (b[field] !== undefined) {
      const r = nonNegativeFinite(b[field], field);
      if (!r.ok) return r;
      if (r.value > 100) return { ok: false, error: `${field} debe ser <= 100` };
      out[field] = r.value;
    }
  }

  if (b.monthlyInvest !== undefined) {
    const r = nonNegativeFinite(b.monthlyInvest, "monthlyInvest");
    if (!r.ok) return r;
    out.monthlyInvest = r.value;
  }

  if (b.emergencyMonths !== undefined) {
    if (typeof b.emergencyMonths !== "number" || !Number.isInteger(b.emergencyMonths) || b.emergencyMonths < 0) {
      return { ok: false, error: "emergencyMonths debe ser entero >= 0" };
    }
    out.emergencyMonths = b.emergencyMonths;
  }

  if (b.active !== undefined) {
    if (typeof b.active !== "boolean") return { ok: false, error: "active debe ser boolean" };
    out.active = b.active;
  }

  if (b.notes !== undefined) {
    if (!isNullableString(b.notes)) return { ok: false, error: "notes debe ser string|null" };
    out.notes = b.notes;
  }

  if (b.tagline !== undefined) {
    if (!isNullableString(b.tagline)) return { ok: false, error: "tagline debe ser string|null" };
    if (typeof b.tagline === "string" && b.tagline.length > 300) {
      return { ok: false, error: "tagline demasiado largo (max 300)" };
    }
    out.tagline = b.tagline;
  }

  if (b.philosophy !== undefined) {
    if (!isNullableString(b.philosophy)) return { ok: false, error: "philosophy debe ser string|null" };
    if (typeof b.philosophy === "string" && b.philosophy.length > 5000) {
      return { ok: false, error: "philosophy demasiado largo (max 5000)" };
    }
    out.philosophy = b.philosophy;
  }

  if (b.policiesJson !== undefined) {
    if (b.policiesJson === null) {
      out.policiesJson = null;
    } else if (typeof b.policiesJson !== "string") {
      return { ok: false, error: "policiesJson debe ser string|null" };
    } else {
      // Estricto en escritura — si el JSON no parsea o no valida, 400.
      let parsed: unknown;
      try {
        parsed = JSON.parse(b.policiesJson);
      } catch {
        return { ok: false, error: "policiesJson no es JSON válido" };
      }
      const r = validatePolicies(parsed);
      if (!r.ok) return { ok: false, error: `policiesJson inválido: ${r.error}` };
      out.policiesJson = b.policiesJson;
    }
  }

  if (b.monthlyFixedExpenses !== undefined) {
    const r = nonNegativeFinite(b.monthlyFixedExpenses, "monthlyFixedExpenses");
    if (!r.ok) return r;
    out.monthlyFixedExpenses = r.value;
  }

  return { ok: true, value: out };
}
