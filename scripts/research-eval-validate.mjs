#!/usr/bin/env node
/**
 * Validator — Research Drawer eval (Strategy V2 Fase 0, research-prompt-design §4).
 *
 * Lee docs/planning/research-prompt-evals/<fecha>/_summary.json y aplica los
 * 9 bloqueantes del criterio de aprobación. Reporta PASS/FAIL por ticker +
 * agregado. Exit 1 si algún bloqueante global falla.
 *
 * Uso:
 *   node scripts/research-eval-validate.mjs [fecha]     # default: hoy
 */

import fs from "fs";
import path from "path";

const DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const DIR = path.join(process.cwd(), `docs/planning/research-prompt-evals/${DATE}`);
const SUMMARY = path.join(DIR, "_summary.json");

if (!fs.existsSync(SUMMARY)) {
  console.error(`no encuentro ${SUMMARY}. Corre primero research-eval-run.mjs.`);
  process.exit(2);
}
const rows = JSON.parse(fs.readFileSync(SUMMARY, "utf8"));

// Categorización del dataset de eval — orden de la sección 3 del design doc.
const CATEGORY = {
  PEPE: "obvio-malo", GME: "obvio-malo", HKD: "obvio-malo",
  NVDA: "razonable", "IWDA.AS": "razonable", BTC: "razonable",
  "SAN.MC": "gris", TTWO: "gris", XLE: "gris", "REP.MC": "gris",
};

const REQUIRED_FIELDS = [
  "ticker", "asset_class", "sub_class_proposed", "disqualifiers_checked",
  "disqualifiers_checked_detail", "checklist_failed", "verdict",
  "verdict_reason_short", "what_is_it", "base_rate_note", "pros", "cons",
  "red_flags", "correlation_notes", "technical_state_now", "upcoming_catalysts",
  "mini_backtest", "suggested_rules", "confidence", "confidence_evidence",
];

const blockers = [];

function check(id, pass, msg) {
  if (!pass) blockers.push({ id, msg });
  return pass;
}

let perTicker = rows.map((r) => {
  const t = r.ticker;
  const d = r.dossier;
  const cat = CATEGORY[t] ?? "unknown";
  const issues = [];

  if (!d) {
    issues.push("no_dossier");
    return { ticker: t, category: cat, verdict: r.verdict, issues };
  }

  // B1: obvio-malo nunca candidate.
  if (cat === "obvio-malo" && d.verdict === "candidate") issues.push("B1_obvio_malo_candidate");

  // B2: ≥2 de 3 razonables devuelven candidate|wait (global, validado al final).
  //     NB: pass con disqualifier real (checklist_failed no vacío) también cuenta —
  //     design doc §4: "pass en un razonable SIN DISQUALIFIER REAL = iterar".

  // B3: BTC → verdict=wait por política transición. Excepción: si ya hay un
  //     disqualifier real (p.ej. corr=1.00 con holding BTC actual > 10%), el
  //     pass también es semánticamente correcto — corr guardrail prevalece.
  if (t === "BTC" && d.verdict !== "wait") {
    const hasRealDisqualifier = Array.isArray(d.checklist_failed) && d.checklist_failed.length > 0;
    if (!hasRealDisqualifier) issues.push("B3_btc_not_wait");
  }

  // B4: schema completo.
  for (const f of REQUIRED_FIELDS) {
    if (!(f in d)) issues.push(`B4_missing_field:${f}`);
  }

  // B5: cons ≥ 2, red_flags existe (lista).
  if (!Array.isArray(d.cons) || d.cons.length < 2) issues.push("B5_cons_lt_2");
  if (!Array.isArray(d.red_flags)) issues.push("B5_red_flags_not_array");
  if (!d.base_rate_note) issues.push("B5_base_rate_missing");

  // B6: candidate → suggested_rules != null ∧ mini_backtest.expectancy_R > 0.
  if (d.verdict === "candidate") {
    if (!d.suggested_rules) issues.push("B6_candidate_no_suggested_rules");
    if (!d.mini_backtest) issues.push("B6_candidate_no_backtest");
    else if (!(d.mini_backtest.expectancy_R > 0)) issues.push("B6_candidate_expectancy_le_0");
  }

  // B7: no-candidate → suggested_rules null.
  if (d.verdict !== "candidate" && d.suggested_rules != null) issues.push("B7_non_candidate_has_rules");

  // B8: checklist_failed no-vacío → verdict=pass.
  if (Array.isArray(d.checklist_failed) && d.checklist_failed.length > 0 && d.verdict !== "pass") {
    issues.push("B8_failed_not_pass");
  }

  // B9: confidence=high → confidence_evidence ≥ 3 items con texto concreto.
  if (d.confidence === "high") {
    if (!Array.isArray(d.confidence_evidence) || d.confidence_evidence.length < 3) {
      issues.push("B9_high_conf_lt_3_evidence");
    }
  }

  return { ticker: t, category: cat, verdict: d.verdict, issues };
});

// B2 global: ≥2 de 3 razonables con verdict candidate|wait, o pass con disqualifier real.
const razonables = perTicker.filter((p) => p.category === "razonable");
const razonablesOk = razonables.filter((p) => {
  if (p.verdict === "candidate" || p.verdict === "wait") return true;
  if (p.verdict === "pass") {
    const row = rows.find((r) => r.ticker === p.ticker);
    const failed = row?.dossier?.checklist_failed;
    return Array.isArray(failed) && failed.length > 0;
  }
  return false;
}).length;
check("B2_razonables_gte_2_valid", razonablesOk >= 2,
  `solo ${razonablesOk}/${razonables.length} razonables devolvieron candidate|wait|pass-con-disqualifier`);

// Per-ticker aggregation
for (const p of perTicker) {
  if (p.issues.length > 0) blockers.push({ ticker: p.ticker, issues: p.issues });
}

// Report
console.log(`\n=== RESEARCH EVAL — ${DATE} ===\n`);
console.log("| Ticker   | Categoría    | Verdict    | Issues |");
console.log("|----------|--------------|------------|--------|");
for (const p of perTicker) {
  const issuesStr = p.issues.length === 0 ? "✓" : p.issues.join(", ");
  console.log(`| ${p.ticker.padEnd(8)} | ${p.category.padEnd(12)} | ${(p.verdict ?? "-").padEnd(10)} | ${issuesStr} |`);
}

console.log("\n=== BLOQUEANTES ===");
if (blockers.length === 0) {
  console.log("✓ Todos los bloqueantes superados. Prompt v1 ready for prod.");
  process.exit(0);
} else {
  for (const b of blockers) console.log("✗", JSON.stringify(b));
  console.log(`\n${blockers.length} fallo(s). NO deploy.`);
  process.exit(1);
}
