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

export const db = drizzle(sqlite, { schema });
export { schema };
