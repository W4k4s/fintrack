import type Database from "better-sqlite3";
import { DEFAULT_POLICIES_V2, serializePolicies } from "../strategy/policies";

// Strategy V2 Refactor R1 — backfill idempotente de narrative + policies +
// emergencyMonths + monthlyFixedExpenses para profiles existentes que todavía
// no tienen los campos. Guardrail: sólo aplica cuando tagline IS NULL — no
// pisa ediciones futuras del usuario. Se llama desde src/lib/db/index.ts al
// arranque, justo después de seedStrategySubTargetsFromFlat.
//
// Sub-targets NO se tocan aquí (son destructivos, van en el script manual
// scripts/strategy-r1-apply.ts con --apply + backup).

const V2_TAGLINE =
  "Core + Satellite 2026 — Núcleo diversificado + satélites temáticos con tesis";

const V2_PHILOSOPHY = [
  "Estrategia Core+Satellite: el núcleo (cash rentable + ETF global + ETF factor + bonos ligados a inflación + oro) absorbe la mayoría del capital y compone sin ruido.",
  "Los satélites son posiciones intencionales: crypto (BTC/ETH con cap total 15%) y plays temáticas con tesis escrita y niveles de entrada/target/stop antes de abrir.",
  "El cash no está parado: da rendimiento mientras espera oportunidades. Crypto se pausa si pasa del 17% del patrimonio, y el boost F&G ≤24 sólo aplica a BTC cuando la política lo permita.",
  "Survival first: position sizing > timing de entrada. Backtest everything: ninguna estrategia entra sin haberse validado con datos históricos.",
].join("\n\n");

export function backfillStrategyDefaults(sqlite: Database.Database): void {
  const policiesJson = serializePolicies(DEFAULT_POLICIES_V2);

  // WHERE tagline IS NULL es el único guardrail. SQLite toma lock exclusivo
  // en UPDATE, idempotente incluso si dos procesos arrancan a la vez.
  sqlite
    .prepare(
      `UPDATE strategy_profiles
         SET tagline = ?,
             philosophy = ?,
             policies_json = ?,
             emergency_months = CASE WHEN emergency_months < 5 THEN 5 ELSE emergency_months END,
             monthly_fixed_expenses = CASE WHEN monthly_fixed_expenses = 0 OR monthly_fixed_expenses IS NULL THEN 1768 ELSE monthly_fixed_expenses END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE active = 1
         AND tagline IS NULL`,
    )
    .run(V2_TAGLINE, V2_PHILOSOPHY, policiesJson);
}
