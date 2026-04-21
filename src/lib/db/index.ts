import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { seedStrategySubTargetsFromFlat } from "./seed-sub-targets";

const dbPath = "./data/fintrack.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Idempotent ALTER TABLE: añade columnas nuevas sin migraciones drizzle.
// Usamos try/catch porque SQLite no tiene ADD COLUMN IF NOT EXISTS hasta 3.35+.
function ensureColumn(table: string, column: string, ddl: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  } catch (err) {
    console.warn(`[db] ensureColumn ${table}.${column} failed:`, err);
  }
}

ensureColumn(
  "strategy_profiles",
  "realized_ytd_traditional_override_eur",
  "realized_ytd_traditional_override_eur REAL",
);

// Phase 6.2 — intel_allocation_snapshots (1 row/día, UNIQUE date).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS intel_allocation_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    profile_id INTEGER NOT NULL REFERENCES strategy_profiles(id) ON DELETE CASCADE,
    net_worth_eur REAL NOT NULL,
    allocation TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_intel_allocation_snapshots_date ON intel_allocation_snapshots(date)`,
);

// Phase 8.1b — intel_rebalance_orders: checklist ejecutable derivado del plan.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS intel_rebalance_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER NOT NULL REFERENCES intel_signals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    asset_symbol TEXT,
    asset_class TEXT NOT NULL,
    venue TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    executed_at TEXT,
    actual_amount_eur REAL,
    actual_units REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_intel_rebalance_orders_status_signal ON intel_rebalance_orders(status, signal_id)`,
);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_intel_rebalance_orders_signal ON intel_rebalance_orders(signal_id)`,
);

// Strategy V2 Fase 1 — strategy_sub_targets.
// Allocation por sub-clase (cash_yield, etf_core, etf_factor, bonds_infl, gold,
// crypto_core, crypto_alt, thematic_plays, legacy_hold). Se añade sin tocar
// strategy_profiles; los 6 targets flat (target_cash/etfs/crypto/gold/bonds/stocks)
// siguen vivos y deben coincidir con sum(sub where parent=X) ±0.001.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS strategy_sub_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES strategy_profiles(id) ON DELETE CASCADE,
    sub_class TEXT NOT NULL,
    parent_class TEXT NOT NULL,
    target_pct REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
sqlite.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_strategy_sub_targets_profile_sub
   ON strategy_sub_targets(profile_id, sub_class)`,
);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_strategy_sub_targets_profile_parent
   ON strategy_sub_targets(profile_id, parent_class)`,
);

// Strategy V2 Fase 0 — Research Drawer (intel_assets_tracked).
// Tabla unificada research + watchlist + theses con state machine.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS intel_assets_tracked (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    name TEXT,
    asset_class TEXT,
    sub_class TEXT,
    status TEXT NOT NULL DEFAULT 'researching',
    note TEXT,
    dossier_json TEXT,
    verdict TEXT,
    technical_snapshot_json TEXT,
    fundamentals_json TEXT,
    correlation_json TEXT,
    news_preview_json TEXT,
    dossier_ttl_at TEXT,
    researched_at TEXT,
    requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    failure_reason TEXT,
    price_source TEXT,
    interest_reason TEXT,
    thesis TEXT,
    entry_plan TEXT,
    entry_price REAL,
    entry_date TEXT,
    target_price REAL,
    stop_price REAL,
    time_horizon_months INTEGER,
    closed_at TEXT,
    closed_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
// Idempotencia: solo un research activo por ticker a la vez.
sqlite.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_tracked_researching_per_ticker
   ON intel_assets_tracked(ticker) WHERE status = 'researching'`,
);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_intel_tracked_status ON intel_assets_tracked(status)`,
);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_intel_tracked_ticker ON intel_assets_tracked(ticker)`,
);

// Strategy V2 Fase 1 — seed idempotente. Solo inserta si el profile no tiene
// ya filas en strategy_sub_targets, así no pisa ediciones del usuario.
seedStrategySubTargetsFromFlat(sqlite);

export const db = drizzle(sqlite, { schema });
export { schema };
