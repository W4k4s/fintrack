import type Database from "better-sqlite3";

// Strategy V2 Fase 1 — seed idempotente de strategy_sub_targets para cada
// strategy_profile que aún no tenga filas. Split determinista por
// proporciones V2 (ver docs/planning/strategy-v2.md §4.2) dentro de cada
// parent_class flat. La invariante sum(sub WHERE parent=X) == target_X_flat
// se preserva exactamente: el residuo de redondeo se aplica a la primera
// sub-clase de cada parent.

type ParentClass = "cash" | "etfs" | "crypto" | "gold" | "bonds" | "stocks";

type SubShare = { subClass: string; share: number };

// Pesos relativos dentro de cada parent (suma 1.0 por parent).
// Derivados del V2 target final (20/28/10/10/7/10/5/7/3) normalizado.
const SPLIT: Record<ParentClass, SubShare[]> = {
  cash: [
    { subClass: "cash_yield", share: 1.0 },
  ],
  etfs: [
    { subClass: "etf_core", share: 28 / 38 },
    { subClass: "etf_factor", share: 10 / 38 },
  ],
  crypto: [
    { subClass: "crypto_core", share: 10 / 18 },
    { subClass: "crypto_alt", share: 5 / 18 },
    { subClass: "legacy_hold", share: 3 / 18 },
  ],
  gold: [
    { subClass: "gold", share: 1.0 },
  ],
  bonds: [
    { subClass: "bonds_infl", share: 1.0 },
  ],
  stocks: [
    { subClass: "thematic_plays", share: 1.0 },
  ],
};

const FLAT_COLUMN: Record<ParentClass, string> = {
  cash: "target_cash",
  etfs: "target_etfs",
  crypto: "target_crypto",
  gold: "target_gold",
  bonds: "target_bonds",
  stocks: "target_stocks",
};

type ProfileRow = {
  id: number;
  target_cash: number;
  target_etfs: number;
  target_crypto: number;
  target_gold: number;
  target_bonds: number;
  target_stocks: number;
};

function splitPreservingInvariant(
  flatPct: number,
  shares: SubShare[],
): Array<{ subClass: string; pct: number }> {
  if (flatPct <= 0 || shares.length === 0) return [];
  const rounded = shares.map((s) => ({
    subClass: s.subClass,
    pct: Math.round(flatPct * s.share * 100) / 100,
  }));
  const sum = rounded.reduce((acc, r) => acc + r.pct, 0);
  const residual = Math.round((flatPct - sum) * 100) / 100;
  if (residual !== 0 && rounded.length > 0) {
    rounded[0].pct = Math.round((rounded[0].pct + residual) * 100) / 100;
  }
  return rounded;
}

export function seedStrategySubTargetsFromFlat(sqlite: Database.Database): void {
  const profiles = sqlite
    .prepare(
      `SELECT id, target_cash, target_etfs, target_crypto, target_gold, target_bonds, target_stocks
       FROM strategy_profiles`,
    )
    .all() as ProfileRow[];

  const insertStmt = sqlite.prepare(
    `INSERT INTO strategy_sub_targets (profile_id, sub_class, parent_class, target_pct, notes)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const countStmt = sqlite.prepare(
    `SELECT COUNT(*) as n FROM strategy_sub_targets WHERE profile_id = ?`,
  );

  for (const profile of profiles) {
    const existing = (countStmt.get(profile.id) as { n: number }).n;
    if (existing > 0) continue;

    const seedMany = sqlite.transaction(() => {
      for (const parent of Object.keys(SPLIT) as ParentClass[]) {
        const flat = profile[FLAT_COLUMN[parent] as keyof ProfileRow] as number;
        const rows = splitPreservingInvariant(flat, SPLIT[parent]);
        for (const row of rows) {
          insertStmt.run(
            profile.id,
            row.subClass,
            parent,
            row.pct,
            "seed F1a desde flat target",
          );
        }
      }
    });
    seedMany();
  }
}
