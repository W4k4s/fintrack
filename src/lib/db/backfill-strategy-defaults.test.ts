import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { backfillStrategyDefaults } from "./backfill-strategy-defaults.ts";
import { DEFAULT_POLICIES_V2, parsePolicies } from "../strategy/policies.ts";

function freshDb(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE strategy_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      risk_profile TEXT NOT NULL DEFAULT 'balanced',
      target_cash REAL NOT NULL DEFAULT 15,
      target_etfs REAL NOT NULL DEFAULT 30,
      target_crypto REAL NOT NULL DEFAULT 25,
      target_gold REAL NOT NULL DEFAULT 10,
      target_bonds REAL NOT NULL DEFAULT 10,
      target_stocks REAL NOT NULL DEFAULT 10,
      monthly_invest REAL NOT NULL DEFAULT 903,
      emergency_months INTEGER NOT NULL DEFAULT 3,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      tagline TEXT,
      philosophy TEXT,
      policies_json TEXT,
      monthly_fixed_expenses REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  return sqlite;
}

function insertProfile(
  sqlite: Database.Database,
  overrides: {
    name?: string;
    active?: number;
    tagline?: string | null;
    emergencyMonths?: number;
    monthlyFixedExpenses?: number;
  } = {},
): number {
  const res = sqlite
    .prepare(
      `INSERT INTO strategy_profiles (name, active, tagline, emergency_months, monthly_fixed_expenses)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      overrides.name ?? "Test",
      overrides.active ?? 1,
      overrides.tagline ?? null,
      overrides.emergencyMonths ?? 3,
      overrides.monthlyFixedExpenses ?? 0,
    );
  return res.lastInsertRowid as number;
}

test("backfillStrategyDefaults: profile activo sin tagline → pobla todos los campos V2", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite);

  backfillStrategyDefaults(sqlite);

  const row = sqlite
    .prepare(`SELECT tagline, philosophy, policies_json, emergency_months, monthly_fixed_expenses FROM strategy_profiles WHERE id = ?`)
    .get(id) as {
      tagline: string;
      philosophy: string;
      policies_json: string;
      emergency_months: number;
      monthly_fixed_expenses: number;
    };

  assert.ok(row.tagline && row.tagline.length > 10, "tagline populated");
  assert.ok(row.philosophy && row.philosophy.length > 50, "philosophy populated");
  assert.deepEqual(parsePolicies(row.policies_json), DEFAULT_POLICIES_V2);
  assert.equal(row.emergency_months, 5);
  assert.equal(row.monthly_fixed_expenses, 1768);
});

test("backfillStrategyDefaults: idempotente — segunda corrida no cambia nada", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite);
  backfillStrategyDefaults(sqlite);
  const before = sqlite.prepare(`SELECT tagline, philosophy, policies_json, emergency_months, monthly_fixed_expenses FROM strategy_profiles WHERE id = ?`).get(id);

  backfillStrategyDefaults(sqlite);
  const after = sqlite.prepare(`SELECT tagline, philosophy, policies_json, emergency_months, monthly_fixed_expenses FROM strategy_profiles WHERE id = ?`).get(id);

  assert.deepEqual(after, before);
});

test("backfillStrategyDefaults: NO pisa tagline si usuario ya lo editó", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { tagline: "Mi custom tagline" });

  backfillStrategyDefaults(sqlite);

  const row = sqlite
    .prepare(`SELECT tagline, philosophy, emergency_months, monthly_fixed_expenses FROM strategy_profiles WHERE id = ?`)
    .get(id) as { tagline: string; philosophy: string | null; emergency_months: number; monthly_fixed_expenses: number };

  assert.equal(row.tagline, "Mi custom tagline");
  assert.equal(row.philosophy, null, "philosophy queda null porque guardrail dispara en tagline");
  assert.equal(row.emergency_months, 3, "emergencyMonths no se toca porque guardrail mira tagline");
});

test("backfillStrategyDefaults: NO toca profile inactivo", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { active: 0 });

  backfillStrategyDefaults(sqlite);

  const row = sqlite
    .prepare(`SELECT tagline FROM strategy_profiles WHERE id = ?`)
    .get(id) as { tagline: string | null };

  assert.equal(row.tagline, null);
});

test("backfillStrategyDefaults: respeta emergencyMonths > 5 si usuario subió el valor", () => {
  const sqlite = freshDb();
  const id = insertProfile(sqlite, { emergencyMonths: 8 });

  backfillStrategyDefaults(sqlite);

  const row = sqlite
    .prepare(`SELECT emergency_months FROM strategy_profiles WHERE id = ?`)
    .get(id) as { emergency_months: number };

  assert.equal(row.emergency_months, 8);
});
