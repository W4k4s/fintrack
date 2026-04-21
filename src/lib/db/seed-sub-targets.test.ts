import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { recalcFlatFromSubTargets, seedStrategySubTargetsFromFlat } from "./seed-sub-targets.ts";

function freshDb(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE strategy_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_cash REAL NOT NULL DEFAULT 0,
      target_etfs REAL NOT NULL DEFAULT 0,
      target_crypto REAL NOT NULL DEFAULT 0,
      target_gold REAL NOT NULL DEFAULT 0,
      target_bonds REAL NOT NULL DEFAULT 0,
      target_stocks REAL NOT NULL DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE strategy_sub_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      sub_class TEXT NOT NULL,
      parent_class TEXT NOT NULL,
      target_pct REAL NOT NULL,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  return sqlite;
}

function insertProfile(sqlite: Database.Database, flat: Record<string, number>): number {
  const info = sqlite
    .prepare(
      `INSERT INTO strategy_profiles (name, target_cash, target_etfs, target_crypto, target_gold, target_bonds, target_stocks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("test", flat.cash, flat.etfs, flat.crypto, flat.gold, flat.bonds, flat.stocks);
  return Number(info.lastInsertRowid);
}

test("seedStrategySubTargetsFromFlat respeta invariante sum(sub por parent) == flat", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { cash: 15, etfs: 30, crypto: 25, gold: 10, bonds: 10, stocks: 10 });
  seedStrategySubTargetsFromFlat(sqlite);

  const rows = sqlite
    .prepare(`SELECT parent_class, SUM(target_pct) AS s FROM strategy_sub_targets WHERE profile_id = ? GROUP BY parent_class`)
    .all(id) as Array<{ parent_class: string; s: number }>;
  const byParent = Object.fromEntries(rows.map((r) => [r.parent_class, Math.round(r.s * 100) / 100]));

  assert.equal(byParent.cash, 15);
  assert.equal(byParent.etfs, 30);
  assert.equal(byParent.crypto, 25);
  assert.equal(byParent.gold, 10);
  assert.equal(byParent.bonds, 10);
  assert.equal(byParent.stocks, 10);
});

test("seedStrategySubTargetsFromFlat es idempotente (no duplica al correr 2 veces)", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { cash: 15, etfs: 30, crypto: 25, gold: 10, bonds: 10, stocks: 10 });
  seedStrategySubTargetsFromFlat(sqlite);
  seedStrategySubTargetsFromFlat(sqlite);
  const count = (sqlite.prepare(`SELECT COUNT(*) AS n FROM strategy_sub_targets WHERE profile_id = ?`).get(id) as { n: number }).n;
  assert.equal(count, 9, "9 sub-clases insertadas una sola vez");
});

test("recalcFlatFromSubTargets actualiza flat = sum(sub por parent)", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { cash: 0, etfs: 0, crypto: 0, gold: 0, bonds: 0, stocks: 0 });

  const insert = sqlite.prepare(
    `INSERT INTO strategy_sub_targets (profile_id, sub_class, parent_class, target_pct) VALUES (?, ?, ?, ?)`,
  );
  insert.run(id, "cash_yield", "cash", 20);
  insert.run(id, "etf_core", "etfs", 28);
  insert.run(id, "etf_factor", "etfs", 10);
  insert.run(id, "crypto_core", "crypto", 10);
  insert.run(id, "crypto_alt", "crypto", 5);
  insert.run(id, "legacy_hold", "crypto", 3);
  insert.run(id, "gold", "gold", 7);
  insert.run(id, "bonds_infl", "bonds", 10);
  insert.run(id, "thematic_plays", "stocks", 7);

  const flat = recalcFlatFromSubTargets(sqlite, id);
  assert.equal(flat.cash, 20);
  assert.equal(flat.etfs, 38);
  assert.equal(flat.crypto, 18);
  assert.equal(flat.gold, 7);
  assert.equal(flat.bonds, 10);
  assert.equal(flat.stocks, 7);

  const profileRow = sqlite
    .prepare(`SELECT target_cash, target_etfs, target_crypto, target_gold, target_bonds, target_stocks FROM strategy_profiles WHERE id = ?`)
    .get(id) as Record<string, number>;
  assert.equal(profileRow.target_cash, 20);
  assert.equal(profileRow.target_etfs, 38);
  assert.equal(profileRow.target_crypto, 18);
  assert.equal(profileRow.target_gold, 7);
  assert.equal(profileRow.target_bonds, 10);
  assert.equal(profileRow.target_stocks, 7);
});

test("recalcFlatFromSubTargets con profile sin sub-targets pone todo a 0", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { cash: 15, etfs: 30, crypto: 25, gold: 10, bonds: 10, stocks: 10 });
  const flat = recalcFlatFromSubTargets(sqlite, id);
  for (const v of Object.values(flat)) assert.equal(v, 0);
});
