import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ASSET_CLASSES, type AssetClass } from "./classify";

// Strategy V2 Fase 1 — helpers para leer sub-targets con fallback al flat.
// Los 4 detectores de la Fase 1 (rebalance-drift, rebalance/planner,
// concentration-risk, correlation-risk) usan getSubTargets() como fuente
// principal; si el profile no tiene filas en strategy_sub_targets, caen
// al expand flat vía SPLIT determinista para que el comportamiento sea
// idéntico al pre-F1.

export type SubClass =
  | "cash_yield"
  | "etf_core"
  | "etf_factor"
  | "bonds_infl"
  | "gold"
  | "crypto_core"
  | "crypto_alt"
  | "thematic_plays"
  | "legacy_hold";

export interface SubTarget {
  subClass: SubClass;
  parentClass: AssetClass;
  targetPct: number;
}

/**
 * Mapeo sub-clase V2 → parent AssetClass. Lo comparten los detectores
 * `opportunity` y `thesis_watch`. Es la inversa colapsada de FALLBACK_SPLIT.
 */
export const SUB_TO_PARENT: Record<SubClass, AssetClass> = {
  cash_yield: "cash",
  etf_core: "etfs",
  etf_factor: "etfs",
  bonds_infl: "bonds",
  gold: "gold",
  crypto_core: "crypto",
  crypto_alt: "crypto",
  thematic_plays: "stocks",
  legacy_hold: "crypto",
};

const FALLBACK_SPLIT: Record<AssetClass, Array<{ subClass: SubClass; share: number }>> = {
  cash: [{ subClass: "cash_yield", share: 1.0 }],
  etfs: [
    { subClass: "etf_core", share: 28 / 38 },
    { subClass: "etf_factor", share: 10 / 38 },
  ],
  crypto: [
    { subClass: "crypto_core", share: 10 / 18 },
    { subClass: "crypto_alt", share: 5 / 18 },
    { subClass: "legacy_hold", share: 3 / 18 },
  ],
  gold: [{ subClass: "gold", share: 1.0 }],
  bonds: [{ subClass: "bonds_infl", share: 1.0 }],
  stocks: [{ subClass: "thematic_plays", share: 1.0 }],
};

const FLAT_KEY: Record<AssetClass, keyof typeof schema.strategyProfiles.$inferSelect> = {
  cash: "targetCash",
  etfs: "targetEtfs",
  crypto: "targetCrypto",
  gold: "targetGold",
  bonds: "targetBonds",
  stocks: "targetStocks",
};

export function expandFlatToSub(profile: typeof schema.strategyProfiles.$inferSelect): SubTarget[] {
  const out: SubTarget[] = [];
  for (const parent of ASSET_CLASSES) {
    const flat = Number(profile[FLAT_KEY[parent]] ?? 0);
    if (flat <= 0) continue;
    const shares = FALLBACK_SPLIT[parent];
    const rounded = shares.map((s) => ({
      subClass: s.subClass,
      pct: Math.round(flat * s.share * 100) / 100,
    }));
    const sum = rounded.reduce((acc, r) => acc + r.pct, 0);
    const residual = Math.round((flat - sum) * 100) / 100;
    if (residual !== 0 && rounded.length > 0) {
      rounded[0].pct = Math.round((rounded[0].pct + residual) * 100) / 100;
    }
    for (const r of rounded) {
      out.push({ subClass: r.subClass, parentClass: parent, targetPct: r.pct });
    }
  }
  return out;
}

/**
 * Devuelve los sub-targets del profile activo (o del profileId indicado).
 * Si la tabla `strategy_sub_targets` está vacía para ese profile, expande el
 * flat vía `FALLBACK_SPLIT`. Garantiza invariante sum(sub where parent=X) ≈
 * target_X_flat ±0.01.
 */
export async function getSubTargets(profileId?: number): Promise<SubTarget[]> {
  const [profile] = profileId
    ? await db.select().from(schema.strategyProfiles).where(eq(schema.strategyProfiles.id, profileId)).limit(1)
    : await db.select().from(schema.strategyProfiles).where(eq(schema.strategyProfiles.active, true)).limit(1);
  if (!profile) return [];

  const rows = await db
    .select()
    .from(schema.strategySubTargets)
    .where(eq(schema.strategySubTargets.profileId, profile.id));

  if (rows.length > 0) {
    return rows.map((r) => ({
      subClass: r.subClass as SubClass,
      parentClass: r.parentClass as AssetClass,
      targetPct: r.targetPct,
    }));
  }

  return expandFlatToSub(profile);
}

/**
 * Agrega sub-targets por parent_class. Útil para detectores que siguen
 * operando en flat por ahora pero consumen la tabla nueva.
 */
export function aggregateByParent(subs: SubTarget[]): Record<AssetClass, number> {
  const out: Record<AssetClass, number> = {
    cash: 0,
    etfs: 0,
    crypto: 0,
    gold: 0,
    bonds: 0,
    stocks: 0,
  };
  for (const s of subs) out[s.parentClass] += s.targetPct;
  return out;
}
