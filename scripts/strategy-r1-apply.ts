#!/usr/bin/env -S pnpm tsx
// Strategy V2 Refactor R1 — apply script.
//
// Acciones (destructivas, requieren --apply):
//  1. Backup DB timestamped en data/backups/.
//  2. Reset strategy_sub_targets del profile activo a los 9 V2 finales:
//     cash_yield 20, etf_core 28, etf_factor 10, bonds_infl 10, gold 7,
//     crypto_core 10, crypto_alt 5, thematic_plays 7, legacy_hold 3.
//     Transaccional: DELETE + INSERT + recalcFlatFromSubTargets (mantiene
//     invariante sum(sub where parent=X) == target_X_flat).
//  3. DELETE goal id=5 "Bajar cash a 25%" con guardrail estricto (type+name+
//     profile_id) + abort si changes != 1.
//  4. backfillStrategyDefaults (narrative/policies/emergencyMonths/fixed
//     expenses) — idempotente aunque ya haya corrido al boot.
//
// Uso:
//   pnpm tsx scripts/strategy-r1-apply.ts                # dry-run, imprime plan
//   pnpm tsx scripts/strategy-r1-apply.ts --apply        # ejecuta
//
// Idempotente: re-correr con --apply tras un success no cambia nada. El
// guardrail de delete-goal exige que el row siga existiendo y lance error
// silencioso si ya se borró (mensaje claro).

import Database from "better-sqlite3";
import { copyFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { recalcFlatFromSubTargets } from "../src/lib/db/seed-sub-targets.ts";
import { backfillStrategyDefaults } from "../src/lib/db/backfill-strategy-defaults.ts";

const DB_PATH = "./data/fintrack.db";
const BACKUP_DIR = "./data/backups";

const V2_SUB_TARGETS: Array<{ subClass: string; parentClass: string; pct: number }> = [
  { subClass: "cash_yield", parentClass: "cash", pct: 20 },
  { subClass: "etf_core", parentClass: "etfs", pct: 28 },
  { subClass: "etf_factor", parentClass: "etfs", pct: 10 },
  { subClass: "bonds_infl", parentClass: "bonds", pct: 10 },
  { subClass: "gold", parentClass: "gold", pct: 7 },
  { subClass: "crypto_core", parentClass: "crypto", pct: 10 },
  { subClass: "crypto_alt", parentClass: "crypto", pct: 5 },
  { subClass: "thematic_plays", parentClass: "stocks", pct: 7 },
  { subClass: "legacy_hold", parentClass: "crypto", pct: 3 },
];

const GOAL_ID_TO_DELETE = 5;
const GOAL_NAME_PREFIX = "Bajar cash";
const GOAL_TYPE = "custom";

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function backupDb(): string {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = `${BACKUP_DIR}/fintrack.pre-r1-apply-${timestamp()}.db`;
  copyFileSync(DB_PATH, dest);
  return dest;
}

function getActiveProfileId(sqlite: Database.Database): number {
  const row = sqlite.prepare(`SELECT id FROM strategy_profiles WHERE active = 1 LIMIT 1`).get() as
    | { id: number }
    | undefined;
  if (!row) throw new Error("No active strategy profile found");
  return row.id;
}

function describeSubTargetsCurrent(sqlite: Database.Database, profileId: number): string {
  const rows = sqlite
    .prepare(`SELECT sub_class, parent_class, target_pct FROM strategy_sub_targets WHERE profile_id = ? ORDER BY parent_class, sub_class`)
    .all(profileId) as Array<{ sub_class: string; parent_class: string; target_pct: number }>;
  if (rows.length === 0) return "  (sin filas)";
  return rows.map((r) => `  ${r.sub_class.padEnd(16)} ${r.parent_class.padEnd(8)} ${r.target_pct.toFixed(2)}%`).join("\n");
}

function describeV2(): string {
  return V2_SUB_TARGETS.map((r) => `  ${r.subClass.padEnd(16)} ${r.parentClass.padEnd(8)} ${r.pct.toFixed(2)}%`).join("\n");
}

function describeGoal(sqlite: Database.Database, id: number): string | null {
  const row = sqlite.prepare(`SELECT id, name, type, target_value, profile_id FROM strategy_goals WHERE id = ?`).get(id) as
    | { id: number; name: string; type: string; target_value: number; profile_id: number }
    | undefined;
  if (!row) return null;
  return `id=${row.id} type=${row.type} name="${row.name}" target=${row.target_value} profile=${row.profile_id}`;
}

function applySubTargetsReset(sqlite: Database.Database, profileId: number): void {
  const tx = sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM strategy_sub_targets WHERE profile_id = ?`).run(profileId);
    const insert = sqlite.prepare(
      `INSERT INTO strategy_sub_targets (profile_id, sub_class, parent_class, target_pct, notes)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const r of V2_SUB_TARGETS) {
      insert.run(profileId, r.subClass, r.parentClass, r.pct, "R1 apply — V2 target final");
    }
    recalcFlatFromSubTargets(sqlite, profileId);
  });
  tx();
}

function applyDeleteGoal(sqlite: Database.Database, profileId: number): { changes: number } {
  const stmt = sqlite.prepare(
    `DELETE FROM strategy_goals
       WHERE id = ?
         AND type = ?
         AND name LIKE ?
         AND profile_id = ?`,
  );
  const result = stmt.run(GOAL_ID_TO_DELETE, GOAL_TYPE, `${GOAL_NAME_PREFIX}%`, profileId);
  return { changes: result.changes };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY-RUN";

  console.log(`\n=== strategy-r1-apply.ts  [${mode}] ===\n`);

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("foreign_keys = ON");
  const profileId = getActiveProfileId(sqlite);

  console.log(`Active profile id=${profileId}\n`);

  // 1. Sub-targets diff
  console.log("--- Sub-targets actuales ---");
  console.log(describeSubTargetsCurrent(sqlite, profileId));
  console.log("\n--- Sub-targets V2 final ---");
  console.log(describeV2());

  // 2. Goal a borrar
  console.log("\n--- Goal id=5 ---");
  const goalDesc = describeGoal(sqlite, GOAL_ID_TO_DELETE);
  console.log(goalDesc ?? "  (no existe — ya borrado)");

  if (!apply) {
    console.log("\n[DRY-RUN] Nada aplicado. Re-ejecuta con --apply para efectuar los cambios.\n");
    sqlite.close();
    return;
  }

  // APPLY path
  const backupPath = backupDb();
  console.log(`\n[APPLY] Backup DB → ${backupPath}`);

  applySubTargetsReset(sqlite, profileId);
  console.log("[APPLY] Sub-targets reseteados a V2.");

  if (goalDesc) {
    const { changes } = applyDeleteGoal(sqlite, profileId);
    if (changes !== 1) {
      console.error(`[APPLY] FAIL — delete goal affected ${changes} rows, expected 1. Aborting further steps. Rollback manual desde ${backupPath} si es necesario.`);
      sqlite.close();
      process.exit(1);
    }
    console.log("[APPLY] Goal id=5 borrado.");
  } else {
    console.log("[APPLY] Goal id=5 ya no existe, skip.");
  }

  backfillStrategyDefaults(sqlite);
  console.log("[APPLY] backfillStrategyDefaults ejecutado.");

  // Post-snapshot
  console.log("\n--- Sub-targets tras apply ---");
  console.log(describeSubTargetsCurrent(sqlite, profileId));

  const flatRow = sqlite
    .prepare(`SELECT target_cash, target_etfs, target_crypto, target_gold, target_bonds, target_stocks, tagline, emergency_months, monthly_fixed_expenses FROM strategy_profiles WHERE id = ?`)
    .get(profileId) as {
      target_cash: number;
      target_etfs: number;
      target_crypto: number;
      target_gold: number;
      target_bonds: number;
      target_stocks: number;
      tagline: string | null;
      emergency_months: number;
      monthly_fixed_expenses: number;
    };

  console.log("\n--- Flat recalculado (derivado) ---");
  console.log(`  cash   ${flatRow.target_cash}%`);
  console.log(`  etfs   ${flatRow.target_etfs}%`);
  console.log(`  crypto ${flatRow.target_crypto}%`);
  console.log(`  gold   ${flatRow.target_gold}%`);
  console.log(`  bonds  ${flatRow.target_bonds}%`);
  console.log(`  stocks ${flatRow.target_stocks}%`);
  console.log(`  total  ${(flatRow.target_cash + flatRow.target_etfs + flatRow.target_crypto + flatRow.target_gold + flatRow.target_bonds + flatRow.target_stocks).toFixed(2)}%`);

  console.log("\n--- Profile R1 fields ---");
  console.log(`  tagline          ${flatRow.tagline ? `"${flatRow.tagline.slice(0, 60)}..."` : "(null)"}`);
  console.log(`  emergencyMonths  ${flatRow.emergency_months}`);
  console.log(`  monthlyFixedExp  ${flatRow.monthly_fixed_expenses}€`);

  console.log("\n[APPLY] OK. Suite de tests debe seguir verde. Verifica /strategy en navegador.\n");
  sqlite.close();
}

main().catch((err) => {
  console.error("strategy-r1-apply FAILED:", err);
  process.exit(1);
});

// Suppress dirname-unused lint warning without changing behavior
void dirname;
