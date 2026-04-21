import { db, schema } from "@/lib/db";
import { inArray, eq, and, gte } from "drizzle-orm";

// Strategy V2 Fase 2 — tickers de intel_assets_tracked que el news detector
// debe vigilar. Reglas:
// - status IN (shortlisted, watching, open_position) → siempre entran.
// - status = researching → entran con TTL 7d desde requested_at (surface
//   news mientras Claude investiga, luego desaparece si no se promueve).

export const RESEARCH_TTL_DAYS = 7;

const ACTIVE_STATUSES = [
  "shortlisted",
  "watching",
  "open_position",
] as const;

export function researchTtlCutoffIso(now: Date): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RESEARCH_TTL_DAYS);
  return cutoff.toISOString();
}

/**
 * Devuelve los tickers (ticker column) de intel_assets_tracked que deben
 * entrar como aliases del news detector. Deduplicados, uppercase.
 */
export async function collectTrackedAliasAssets(now: Date = new Date()): Promise<string[]> {
  const activeRows = await db
    .select({ ticker: schema.intelAssetsTracked.ticker })
    .from(schema.intelAssetsTracked)
    .where(inArray(schema.intelAssetsTracked.status, [...ACTIVE_STATUSES]));

  const cutoffIso = researchTtlCutoffIso(now);
  const researchRows = await db
    .select({ ticker: schema.intelAssetsTracked.ticker })
    .from(schema.intelAssetsTracked)
    .where(
      and(
        eq(schema.intelAssetsTracked.status, "researching"),
        gte(schema.intelAssetsTracked.requestedAt, cutoffIso),
      ),
    );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...activeRows, ...researchRows]) {
    const t = (row.ticker ?? "").trim();
    if (!t) continue;
    const upper = t.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(t);
  }
  return out;
}
