#!/usr/bin/env node
/**
 * Eval harness — Research Drawer (Strategy V2 Fase 0 §4).
 *
 * Lanza N tickers vía POST /api/intel/research, espera a que cada uno
 * termine (status != researching) y vuelca el dossier a
 * docs/planning/research-prompt-evals/<fecha>/<ticker>.json.
 *
 * Uso:
 *   node scripts/research-eval-run.mjs ticker1 ticker2 ...
 *
 * Si no se pasan tickers, usa el dataset default de 10 del diseño.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DEFAULT = ["PEPE", "GME", "HKD", "NVDA", "IWDA.AS", "BTC", "SAN.MC", "TTWO", "XLE", "REP.MC"];
const API = process.env.FINTRACK_API || "http://localhost:3000";
const DB = process.env.FINTRACK_DB || `${process.env.HOME}/Projects/fintrack/data/fintrack.db`;
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(process.cwd(), `docs/planning/research-prompt-evals/${DATE}`);

const tickers = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT;

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`[eval] output dir: ${OUT_DIR}`);
console.log(`[eval] running ${tickers.length} tickers: ${tickers.join(", ")}`);

async function postTicker(ticker) {
  const res = await fetch(`${API}/api/intel/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, note: `eval-${DATE}` }),
  });
  if (!res.ok) throw new Error(`POST ${ticker} http ${res.status}`);
  return await res.json();
}

function pollDb(id) {
  const row = execSync(
    `sqlite3 "${DB}" "SELECT status||'|'||COALESCE(verdict,'-')||'|'||COALESCE(failure_reason,'-') FROM intel_assets_tracked WHERE id=${id}"`,
    { encoding: "utf8" },
  ).trim();
  return row;
}

function readDossier(id) {
  const json = execSync(
    `sqlite3 "${DB}" "SELECT dossier_json FROM intel_assets_tracked WHERE id=${id}"`,
    { encoding: "utf8" },
  ).trim();
  return json ? JSON.parse(json) : null;
}

const summary = [];
for (const t of tickers) {
  process.stdout.write(`[eval] ${t.padEnd(10)} POST… `);
  let id;
  try {
    const r = await postTicker(t);
    id = r.id;
    process.stdout.write(`id=${id} reused=${r.reused} `);
  } catch (e) {
    console.log(`ERROR ${e.message}`);
    summary.push({ ticker: t, status: "post_error", reason: e.message });
    continue;
  }

  const start = Date.now();
  let row;
  // Poll hasta 5 min.
  while (Date.now() - start < 5 * 60_000) {
    row = pollDb(id);
    if (!row.startsWith("researching|")) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  const [status, verdict, reason] = (row ?? "timeout|-|-").split("|");
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`→ status=${status} verdict=${verdict} t=${elapsed}s`);

  const dossier = readDossier(id);
  const out = { ticker: t, id, status, verdict, failureReason: reason === "-" ? null : reason, elapsedSec: elapsed, dossier };
  fs.writeFileSync(path.join(OUT_DIR, `${t.replace(/[^A-Za-z0-9._-]/g, "_")}.json`), JSON.stringify(out, null, 2));
  summary.push(out);
}

fs.writeFileSync(path.join(OUT_DIR, "_summary.json"), JSON.stringify(summary, null, 2));
console.log(`[eval] summary written to ${OUT_DIR}/_summary.json`);
