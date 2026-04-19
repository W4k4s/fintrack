import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { mkdirSync } from "fs";
import { dirname } from "path";

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

export const db = drizzle(sqlite, { schema });
export { schema };
