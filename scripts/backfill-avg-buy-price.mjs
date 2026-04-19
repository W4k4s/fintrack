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
console.log(`Updated avg_buy_price for ${updatedSymbols} symbols (${updatedRows} asset rows) from transactions`);
if (nullified > 0) console.log(`${nullified} symbols ended with no net position (nullified)`);

// --- TR securities pass -----------------------------------------------------
// TR securities (MSCI World, Gold ETC, etc.) never enter `transactions` — we
// derive cost basis from bank_transactions trade entries (ISIN + debit/credit).
// Keep in sync with lib/assets/cost-basis.ts::recomputeTrSecuritiesAvgBuy().

const ISIN_MAP = {
  "IE00B4L5Y983": "MSCI World",
  "IE00B0M62X26": "EU Infl Bond",
  "IE00B579F325": "Gold ETC",
  "IE00BP3QZ825": "MSCI Momentum",
  "US5949181045": "MSFT",
  "US67066G1040": "NVDA",
  "ES0113900J37": "SAN",
  "XF000BTC0017": "BTC",
};

const trExchange = db.prepare("SELECT id FROM exchanges WHERE slug='trade-republic'").get();
if (!trExchange) {
  console.log("(no Trade Republic exchange found — skipping TR securities pass)");
  db.close();
  process.exit(0);
}

const trSecurities = db
  .prepare("SELECT id FROM accounts WHERE exchange_id=? AND name='Securities'")
  .get(trExchange.id);
if (!trSecurities) {
  console.log("(no TR Securities account found — skipping TR securities pass)");
  db.close();
  process.exit(0);
}

const trades = db
  .prepare(
    "SELECT description, debit, credit FROM bank_transactions WHERE source='trade-republic' AND type='trade'",
  )
  .all();

const isinRegex = /(?:Buy|Sell)\s+trade\s+([A-Z]{2}[A-Z0-9]{10})/i;
const netByIsin = new Map();
for (const tx of trades) {
  const m = (tx.description || "").match(isinRegex);
  if (!m) continue;
  const isin = m[1];
  if (!ISIN_MAP[isin]) continue;
  const delta = Number(tx.debit || 0) - Number(tx.credit || 0);
  netByIsin.set(isin, (netByIsin.get(isin) || 0) + delta);
}

const eurPerUsd = rates.EUR || 0.85;
let trUpdated = 0;

for (const [isin, netCostEur] of netByIsin) {
  const symbol = ISIN_MAP[isin];
  if (netCostEur <= 0) {
    console.log(`  ${symbol} (${isin}): net cost ${netCostEur.toFixed(2)}€ — no open position, skipped`);
    continue;
  }
  const assetRow = db
    .prepare("SELECT id, amount FROM assets WHERE account_id=? AND symbol=?")
    .get(trSecurities.id, symbol);
  if (!assetRow || !assetRow.amount || assetRow.amount <= 0) {
    console.log(`  ${symbol} (${isin}): ${netCostEur.toFixed(2)}€ cost but no asset row → skipped`);
    continue;
  }
  const avgBuyEur = netCostEur / assetRow.amount;
  const avgBuyUsd = avgBuyEur / eurPerUsd;
  db.prepare("UPDATE assets SET avg_buy_price=? WHERE id=?").run(avgBuyUsd, assetRow.id);
  console.log(
    `  ${symbol} (${isin}): ${assetRow.amount.toFixed(6)} units, ${netCostEur.toFixed(2)}€ net cost → avg=€${avgBuyEur.toFixed(4)} ($${avgBuyUsd.toFixed(4)})`,
  );
  trUpdated++;
}

console.log("");
console.log(`Updated avg_buy_price for ${trUpdated} TR securities from bank_transactions`);
db.close();
