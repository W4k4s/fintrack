import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTradeRepublicCsv } from "./trade-republic-csv.ts";

// Headers reales del CSV de TR. amount/fee/tax vienen firmados (BUY trae
// amount negativo). Solo incluimos las columnas que usa el parser.
const HEADER =
  "datetime,date,type,symbol,name,asset_class,shares,price,amount,fee,tax,transaction_id,description";

function csv(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// -- Reconstrucción posiciones ---------------------------------------------

test("BUY individual reconstruye posición + trade con principal sin fees", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-15T09:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,-405.50,-1.0,0,tx-1,DCA mensual`,
    ]),
  );
  assert.equal(r.securities.length, 1);
  assert.equal(r.crypto.length, 0);
  assert.equal(r.securities[0].symbol, "MSCI World"); // resuelto vía ISIN_MAP
  assert.equal(r.securities[0].quantity, 4.5);

  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].side, "buy");
  assert.equal(r.trades[0].principalEur, 405.5); // |amount|, fee aparte
  assert.equal(r.trades[0].feeEur, 1.0);
  assert.equal(r.trades[0].externalId, "tx-1");
});

test("2 BUYs mismo ISIN → shares acumulan, lastPrice del último", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-01T09:00:00Z,2026-04-01,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,-405.0,0,0,tx-1,`,
      `2026-04-15T09:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,2.5,92.0,-230.0,0,0,tx-2,`,
    ]),
  );
  assert.equal(r.securities.length, 1);
  assert.equal(r.securities[0].quantity, 7.0); // 4.5 + 2.5
  assert.equal(r.securities[0].priceEur, 92.0); // último
  assert.equal(r.trades.length, 2);
});

test("SELL deja posición en 0 → no aparece en securities", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-01T09:00:00Z,2026-04-01,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,-405.0,0,0,tx-1,`,
      `2026-04-15T09:00:00Z,2026-04-15,SELL,IE00B4L5Y983,iShares MSCI World ETF,FUND,-4.5,92.0,414.0,0,-2.0,tx-2,`,
    ]),
  );
  assert.equal(r.securities.length, 0);
  assert.equal(r.trades.length, 2);
  assert.equal(r.trades[1].side, "sell");
  assert.equal(r.trades[1].taxEur, 2.0);
});

test("CRYPTO va a array crypto, no securities", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-15T09:00:00Z,2026-04-15,BUY,BTC,Bitcoin,CRYPTO,0.001,80000.0,-80.0,-0.5,0,tx-c1,`,
    ]),
  );
  assert.equal(r.securities.length, 0);
  assert.equal(r.crypto.length, 1);
  assert.equal(r.crypto[0].symbol, "BTC");
  assert.equal(r.crypto[0].quantity, 0.001);
});

test("Trades fraccionales + enteros: units es |shares|", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-15T09:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,-405.0,0,0,tx-1,`,
      `2026-04-15T10:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,1,92.0,-92.0,0,0,tx-2,`,
    ]),
  );
  assert.equal(r.trades[0].units, 4.5);
  assert.equal(r.trades[1].units, 1);
});

// -- Cash + transactions ---------------------------------------------------

test("Cash balance acumula deltas (amount + fee + tax)", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-01T09:00:00Z,2026-04-01,TRANSFER_INBOUND,,,,,,1000.0,0,0,tx-in,`,
      `2026-04-02T09:00:00Z,2026-04-02,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,-405.0,-1.0,0,tx-1,`,
    ]),
  );
  // 1000 (in) + (-405 - 1) (buy + fee) = 594
  assert.equal(r.cashBalance, 594.0);
  assert.equal(r.totalIn, 1000.0);
  assert.equal(r.totalOut, 406.0); // |amount + fee|
});

test("MIGRATION mueve shares pero NO cash, ni aparece en transactions", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-01T09:00:00Z,2026-04-01,MIGRATION,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,0,0,0,tx-mig,Account migration`,
    ]),
  );
  assert.equal(r.cashBalance, 0);
  assert.equal(r.transactions.length, 0); // migration filtrado
  assert.equal(r.securities.length, 1);
  assert.equal(r.securities[0].quantity, 4.5);
});

// -- Dedup / externalId ----------------------------------------------------

test("Cada row mantiene su transaction_id como externalId (clave de dedup)", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-15T09:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4.5,90.0,-405.0,0,0,uuid-aaa-001,`,
      `2026-04-15T10:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,1,92.0,-92.0,0,0,uuid-aaa-002,`,
    ]),
  );
  const ids = r.transactions.map((t) => t.externalId);
  assert.deepEqual(ids, ["uuid-aaa-001", "uuid-aaa-002"]);
  // El parser no deduplica — eso es responsabilidad del confirm endpoint vía
  // unique parcial (source, external_id). Pero el id se preserva intacto.
});

// -- Robustez --------------------------------------------------------------

test("CSV vacío o solo header → throw", () => {
  assert.throws(() => parseTradeRepublicCsv(""));
  assert.throws(() => parseTradeRepublicCsv(HEADER));
});

test("Orden temporal estable: rows desordenados se reordenan por datetime", () => {
  const r = parseTradeRepublicCsv(
    csv([
      `2026-04-15T10:00:00Z,2026-04-15,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,2,92.0,-184.0,0,0,tx-2,`,
      `2026-04-01T09:00:00Z,2026-04-01,BUY,IE00B4L5Y983,iShares MSCI World ETF,FUND,4,90.0,-360.0,0,0,tx-1,`,
    ]),
  );
  // El último precio aplicado a la posición debe ser el del 15-abr (más reciente).
  assert.equal(r.securities[0].priceEur, 92.0);
});
