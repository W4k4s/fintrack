#!/usr/bin/env node
// One-shot backfill: recompute assets.avg_buy_price (USD) for every symbol
// that has transactions. Mirrors lib/assets/cost-basis.ts logic so it can be
// run via `node scripts/backfill-avg-buy-price.mjs` without touching the server.
//
// FIFO-lite: BUYs increase cumulative units + cost (converted to USD via
// quote_currency). SELLs reduce units at the running average (cost basis
// stays weighted on what's left). Stablecoins = USD 1:1.
//
// Writes avg_buy_price on every assets row sharing the symbol — cost basis
// is a property of the holding, regardless of which account holds it.

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

function toUsd(amount, quote, rates) {
  const q = (quote || "USD").toUpperCase();
  if (q === "USD") return amount;
  if (USD_STABLES.has(q)) return amount;
  const rate = rates[q];
  if (!rate || rate <= 0) return amount;
  return amount / rate;
}

const db = new Database(DB);
const rates = await fetchRates();
console.log(`Using rates: EUR=${rates.EUR}`);

const symbols = db
  .prepare("SELECT DISTINCT symbol FROM transactions ORDER BY symbol")
  .all()
  .map((r) => r.symbol)
  .filter(Boolean);

console.log(`Found ${symbols.length} distinct symbols in transactions`);

const updateStmt = db.prepare("UPDATE assets SET avg_buy_price = ? WHERE symbol = ?");
const selectTx = db.prepare(
  "SELECT type, amount, price, total, quote_currency FROM transactions WHERE symbol = ? ORDER BY date ASC, id ASC",
);

let updatedSymbols = 0;
let updatedRows = 0;
let nullified = 0;

for (const symbol of symbols) {
  const txs = selectTx.all(symbol);
  let units = 0;
  let costUsd = 0;
  for (const tx of txs) {
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (tx.type === "buy") {
      const priceQ = tx.price != null ? Number(tx.price) : null;
      const totalQ = tx.total != null ? Number(tx.total) : null;
      const grossQ = totalQ && totalQ > 0 ? totalQ : priceQ ? priceQ * amount : 0;
      if (grossQ <= 0) continue;
      const grossUsd = toUsd(grossQ, tx.quote_currency, rates);
      units += amount;
      costUsd += grossUsd;
    } else if (tx.type === "sell") {
      if (units <= 0) continue;
      const sold = Math.min(amount, units);
      const avgNow = costUsd / units;
      units -= sold;
      costUsd -= avgNow * sold;
    }
  }

  const avg = units > 0 && costUsd > 0 ? costUsd / units : null;
  const result = updateStmt.run(avg, symbol);
  if (avg != null) {
    updatedSymbols++;
    updatedRows += result.changes;
    console.log(`  ${symbol}: ${units.toFixed(8)} units @ avg=$${avg.toFixed(4)} → ${result.changes} row(s)`);
  } else {
    nullified++;
    if (result.changes > 0) {
      console.log(`  ${symbol}: no net position → cleared avgBuyPrice on ${result.changes} row(s)`);
    }
  }
}

console.log("");
console.log(`Updated avg_buy_price for ${updatedSymbols} symbols (${updatedRows} asset rows)`);
if (nullified > 0) console.log(`${nullified} symbols ended with no net position (nullified)`);
db.close();
