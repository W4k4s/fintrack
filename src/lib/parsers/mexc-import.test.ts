import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseMexcFile,
  parseExchangeTransactions,
  dedupeAgainstExisting,
  type CsvTransaction,
} from "../csv-parsers.ts";
import { parseXlsxRows, isXlsxBuffer } from "../xlsx-rows.ts";

// Synthetic fixtures — same structure/locale as real MEXC Spanish exports, with
// invented amounts (no personal data committed). Real-data end-to-end checks run
// out-of-tree against docs/tax-module via a one-shot script.

const TRADES_HEADER = ["UID", "Pares", "Tiempo", "Dirección", "Precio Completo", "Monto Ejecutado", "Total", "Comisión", "Rol"];
// Two byte-identical fills (rows 2 & 3) — the multiset-dedup case (B1).
const TRADES_ROWS: string[][] = [
  TRADES_HEADER,
  ["1", "BTC_USDC", "2025-04-25 16:46:27", "Venta", "95000", "0.0034", "323", "0USDC", "Maker"],
  ["1", "BTC_USDC", "2025-04-25 16:46:27", "Venta", "95000", "0.0034", "323", "0USDC", "Maker"],
  ["1", "HBAR_USDT", "2025-02-01 21:04:00", "Venta", "0.29", "1000", "290", "0.5USDT", "Taker"],
  ["1", "ETH_USDT", "2025-02-25 11:43:54", "Compra", "2400", "0.5", "1200", "0USDT", "Maker"],
];

const DEPOSITS_ROWS: string[][] = [
  ["UID", "Estado", "Tiempo", "Cripto", "Red", "Monto del Depósito", "TxID", "Progreso"],
  ["1", "Acreditado Correctamente", "2025-01-25 11:01:41", "USDT", "BNB Smart Chain(BEP20)", "100", "0xabc:0", "(62/61)"],
  ["1", "Pendiente", "2025-01-26 10:00:00", "USDT", "BNB Smart Chain(BEP20)", "50", "0xdef:0", "(1/61)"],
];

const WITHDRAWALS_ROWS: string[][] = [
  ["UID", "Estado", "Tiempo", "Cripto", "Red", "Monto de Solicitud", "Dirección de Retiro", "memo", "TxID", "Comisión de Trading", "Monto de Liquidación", "Descripciones de Retiros"],
  ["1", "complete", "2025-03-01 09:00:00", "USDT", "Ethereum(ERC20)", "200", "0xdead", "", "0xtx", "1.5USDT", "198.5", ""],
];

const OTHERS_ROWS: string[][] = [
  ["UID", "Tiempo", "Cripto", "Tipo", "Cantidad", "Estado", "Observación"],
  ["1", "2025-11-17 07:03:52", "ETH", "Airdrop", "0.0000058", "complete", "-"],
];

// ── trades: Spanish locale ────────────────────────────────────────────────
test("parseMexcFile trades: maps Spanish side values and pair split", () => {
  const txs = parseMexcFile(TRADES_ROWS);
  assert.equal(txs.length, 4);

  const sells = txs.filter(t => t.type === "sell");
  const buys = txs.filter(t => t.type === "buy");
  assert.equal(sells.length, 3, "Venta → sell");
  assert.equal(buys.length, 1, "Compra → buy");

  const btc = txs.find(t => t.pair === "BTC_USDC")!;
  assert.equal(btc.symbol, "BTC");
  assert.equal(btc.quoteCurrency, "USDC");
  assert.equal(btc.price, 95000);
  assert.equal(btc.amount, 0.0034);
});

test("parseMexcFile trades: extracts fee currency from the fee cell", () => {
  const txs = parseMexcFile(TRADES_ROWS);
  const hbar = txs.find(t => t.pair === "HBAR_USDT")!;
  assert.ok(Math.abs(hbar.fee - 0.5) < 1e-9, "numeric fee parsed");
  assert.equal(hbar.feeCurrency, "USDT", "trailing letters → fee currency");

  const zeroFee = txs.find(t => t.pair === "BTC_USDC")!;
  assert.equal(zeroFee.fee, 0);
  assert.equal(zeroFee.feeCurrency, "USDC");
});

// ── non-trade categories ──────────────────────────────────────────────────
test("parseMexcFile deposits: type=deposit, null price/total, filters non-complete", () => {
  const txs = parseMexcFile(DEPOSITS_ROWS);
  assert.equal(txs.length, 1, "only 'Acreditado Correctamente' kept");
  const d = txs[0];
  assert.equal(d.type, "deposit");
  assert.equal(d.symbol, "USDT");
  assert.equal(d.amount, 100);
  assert.equal(d.price, null);
  assert.equal(d.total, null);
  assert.equal(d.quoteCurrency, "USDT");
  assert.match(d.notes ?? "", /BNB Smart Chain/);
});

test("parseMexcFile withdrawals: type=withdrawal with fee", () => {
  const txs = parseMexcFile(WITHDRAWALS_ROWS);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].type, "withdrawal");
  assert.equal(txs[0].symbol, "USDT");
  assert.equal(txs[0].amount, 200);
  assert.ok(Math.abs(txs[0].fee - 1.5) < 1e-9);
  assert.equal(txs[0].feeCurrency, "USDT");
});

test("parseMexcFile others: airdrop → deposit with Airdrop note", () => {
  const txs = parseMexcFile(OTHERS_ROWS);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].type, "deposit");
  assert.equal(txs[0].symbol, "ETH");
  assert.equal(txs[0].price, null);
  assert.match(txs[0].notes ?? "", /Airdrop/);
});

// ── fail loud on unknown layout (H6) ──────────────────────────────────────
test("parseMexcFile throws on unrecognized header (no silent empty)", () => {
  assert.throws(
    () => parseMexcFile([["foo", "bar", "baz"], ["1", "2", "3"]]),
    /Cabecera MEXC no reconocida/,
  );
});

// ── dedup: multiset, not set (B1) ─────────────────────────────────────────
test("dedupeAgainstExisting keeps byte-identical fills (multiset)", () => {
  const parsed = parseMexcFile(TRADES_ROWS); // 4 incl. one identical pair
  const { toInsert, skipped } = dedupeAgainstExisting(parsed, []);
  assert.equal(toInsert.length, 4, "identical fills NOT collapsed");
  assert.equal(skipped, 0);

  const identical = toInsert.filter(t => t.pair === "BTC_USDC" && t.amount === 0.0034);
  assert.equal(identical.length, 2, "both identical fills present");
});

test("dedupeAgainstExisting is idempotent on re-import", () => {
  const parsed = parseMexcFile(TRADES_ROWS);
  const existing = parsed.map(t => ({
    date: t.date, symbol: t.symbol, amount: t.amount, price: t.price, type: t.type,
  }));
  const { toInsert, skipped } = dedupeAgainstExisting(parsed, existing);
  assert.equal(toInsert.length, 0, "re-import inserts nothing");
  assert.equal(skipped, parsed.length);
});

test("dedupeAgainstExisting inserts only the new overlap on partial re-import", () => {
  const parsed = parseMexcFile(TRADES_ROWS); // 4 rows
  // DB already has one of the two identical fills → exactly one should remain.
  const existing = [{
    date: parsed[0].date, symbol: "BTC", amount: 0.0034, price: 95000, type: "sell",
  }];
  const { toInsert, skipped } = dedupeAgainstExisting(parsed, existing);
  assert.equal(skipped, 1);
  assert.equal(toInsert.length, 3);
  assert.equal(toInsert.filter(t => t.amount === 0.0034 && t.symbol === "BTC").length, 1);
});

// ── cost-basis invariant proxy ────────────────────────────────────────────
test("non-trades carry null price/total so cost basis (buy/sell only) ignores them", () => {
  const all: CsvTransaction[] = [
    ...parseMexcFile(DEPOSITS_ROWS),
    ...parseMexcFile(OTHERS_ROWS),
  ];
  for (const t of all) {
    assert.ok(t.type === "deposit" || t.type === "withdrawal");
    assert.equal(t.price, null);
    assert.equal(t.total, null);
  }
});

// ── xlsx reader contract ──────────────────────────────────────────────────
test("isXlsxBuffer detects PK magic bytes", () => {
  assert.equal(isXlsxBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])), true);
  assert.equal(isXlsxBuffer(Buffer.from("UID,Pares\n1,BTC", "utf-8")), false);
});

test("parseXlsxRows reads first sheet into trimmed string rows incl. header", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["UID", "Pares"], ["1", "BTC_USDC"]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const rows = parseXlsxRows(buf);
  assert.deepEqual(rows[0], ["UID", "Pares"]);
  assert.deepEqual(rows[1], ["1", "BTC_USDC"]);
});

// ── dispatch by slug ──────────────────────────────────────────────────────
test("parseExchangeTransactions routes mexc slug to parseMexcFile", () => {
  const txs = parseExchangeTransactions(DEPOSITS_ROWS, "mexc");
  assert.equal(txs.length, 1);
  assert.equal(txs[0].type, "deposit");
});
