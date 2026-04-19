import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingOrders, MATCH_WINDOW_MS, AMOUNT_TOLERANCE } from "./order-matcher.ts";
import type { IntelRebalanceOrder } from "../../db/schema.ts";

function mkOrder(overrides: Partial<IntelRebalanceOrder> = {}): IntelRebalanceOrder {
  return {
    id: 1,
    signalId: 44,
    type: "buy",
    assetSymbol: "BTC",
    assetClass: "crypto",
    venue: "binance",
    amountEur: 440,
    status: "pending",
    executedAt: null,
    actualAmountEur: null,
    actualUnits: null,
    notes: null,
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
    ...overrides,
  };
}

test("exact match → 1 candidato", () => {
  const orders = [mkOrder()];
  const tx = {
    symbol: "BTC",
    venue: "binance",
    type: "buy" as const,
    amountEur: 440,
    date: "2026-04-20T00:00:00.000Z",
  };
  const r = findMatchingOrders(tx, orders);
  assert.equal(r.length, 1);
});

test("amount en tolerancia (±20%) → match", () => {
  const orders = [mkOrder({ amountEur: 500 })];
  const inRange = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 440, // -12%, dentro de ±20%
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(inRange.length, 1);
});

test("amount fuera de tolerancia → no match", () => {
  const orders = [mkOrder({ amountEur: 500 })];
  const out = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 350, // -30%, fuera ±20%
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(out.length, 0);
});

test("symbol distinto → no match", () => {
  const orders = [mkOrder({ assetSymbol: "ETH" })];
  const r = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 440,
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(r.length, 0);
});

test("venue distinto → no match (dual-venue BTC)", () => {
  const orders = [
    mkOrder({ id: 1, venue: "binance", amountEur: 440 }),
    mkOrder({ id: 2, venue: "mexc", amountEur: 440 }),
  ];
  const r = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 440,
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 1);
});

test("type distinto (buy vs sell) → no match", () => {
  const orders = [mkOrder({ type: "sell" })];
  const r = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 440,
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(r.length, 0);
});

test("fuera de ventana temporal (>30d) → no match", () => {
  const orders = [mkOrder({ createdAt: "2026-01-01T00:00:00.000Z" })];
  const r = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 440,
      date: "2026-04-20T00:00:00.000Z", // >30d después
    },
    orders,
  );
  assert.equal(r.length, 0);
});

test("status != pending → no match", () => {
  const orders = [mkOrder({ status: "executed" }), mkOrder({ status: "dismissed" })];
  const r = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 440,
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(r.length, 0);
});

test("ambiguo: >1 order pendiente mismo symbol+venue+type → >1 candidato", () => {
  // Este escenario ocurre si se reejecuta un plan o hay dos orders en ventana.
  // La función pura devuelve todos; el caller decide tratamiento.
  const orders = [
    mkOrder({ id: 1, amountEur: 440, createdAt: "2026-04-10T00:00:00.000Z" }),
    mkOrder({ id: 2, amountEur: 460, createdAt: "2026-04-15T00:00:00.000Z" }),
  ];
  const r = findMatchingOrders(
    {
      symbol: "BTC",
      venue: "binance",
      type: "buy",
      amountEur: 450,
      date: "2026-04-20T00:00:00.000Z",
    },
    orders,
  );
  assert.equal(r.length, 2);
});

test("constantes: tolerancia y ventana razonables", () => {
  assert.ok(AMOUNT_TOLERANCE >= 0.1 && AMOUNT_TOLERANCE <= 0.3);
  assert.ok(MATCH_WINDOW_MS >= 7 * 86400_000 && MATCH_WINDOW_MS <= 60 * 86400_000);
});
