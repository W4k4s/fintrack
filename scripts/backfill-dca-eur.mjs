#!/usr/bin/env node
// One-shot backfill: recompute dca_executions.amount + .price in EUR for rows
// whose underlying transactions are quoted in USDC/USDT/etc.
//
// Strategy: for each Auto-sync execution, find the buy transactions on the same
// (date, asset) and re-aggregate using quote_currency + current USD/EUR rate.
// Rows created from manual entries or TradeRepublic (already EUR) are skipped.

import Database from "better-sqlite3";

const DB = "./data/fintrack.db";
const USD_STABLES = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

async function fetchRates() {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    return data.rates || { USD: 1, EUR: 0.85 };
  } catch {
    return { USD: 1, EUR: 0.85 };
  }
}

function toEur(amount, quote, rates) {
  const q = (quote || "USD").toUpperCase();
  const eurPerUsd = rates.EUR || 0.85;
  if (q === "EUR") return amount;
  if (USD_STABLES.has(q)) return amount * eurPerUsd;
  const srcRate = rates[q];
  if (!srcRate) return amount * eurPerUsd;
  return (amount / srcRate) * eurPerUsd;
}

const db = new Database(DB);
const rates = await fetchRates();
console.log(`Using USD→EUR rate: ${rates.EUR}`);

const execs = db
  .prepare(
    `SELECT e.id, e.plan_id, e.date, e.amount, e.price, e.units, e.notes, p.asset
     FROM dca_executions e
     LEFT JOIN investment_plans p ON e.plan_id = p.id
     WHERE e.notes LIKE 'Auto-sync:%'`,
  )
  .all();

console.log(`Found ${execs.length} auto-sync executions to review.`);

const upd = db.prepare(
  `UPDATE dca_executions SET amount = ?, price = ? WHERE id = ?`,
);
const txByDateSym = db.prepare(
  `SELECT total, amount AS units, price, quote_currency
   FROM transactions
   WHERE type = 'buy' AND date = ? AND symbol = ?`,
);

let updated = 0;
let unchanged = 0;

for (const e of execs) {
  const txs = txByDateSym.all(e.date, e.asset);
  if (txs.length === 0) {
    unchanged++;
    continue;
  }
  const totalEur = txs.reduce(
    (s, t) => s + toEur(t.total || 0, t.quote_currency, rates),
    0,
  );
  const totalUnits = txs.reduce((s, t) => s + (t.units || 0), 0);
  const avgPriceEur = totalUnits > 0 ? totalEur / totalUnits : null;

  const newAmount = Math.round(totalEur * 100) / 100;
  const newPrice = avgPriceEur ? Math.round(avgPriceEur * 100) / 100 : null;

  if (newAmount !== e.amount || newPrice !== e.price) {
    upd.run(newAmount, newPrice, e.id);
    console.log(
      `  #${e.id} ${e.date} ${e.asset}: ${e.amount} → ${newAmount} EUR (price ${e.price} → ${newPrice})`,
    );
    updated++;
  } else {
    unchanged++;
  }
}

console.log(`\nDone. Updated ${updated}, unchanged ${unchanged}.`);
db.close();
