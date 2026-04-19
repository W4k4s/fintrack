import { test } from "node:test";
import assert from "node:assert/strict";
import { planToOrderRows, ORDER_EXPIRATION_DAYS } from "./orders.ts";
import type { RebalancePlan } from "./types.ts";

// Lógica DB cubierta por tests e2e manuales vía tick real; aquí probamos la
// transformación pura plan → rows.

function basePlan(): RebalancePlan {
  return {
    netWorthEur: 50000,
    generatedWeek: "2026-W16",
    targets: {
      cash: { actualPct: 50, targetPct: 25, driftPp: 25 },
      crypto: { actualPct: 10, targetPct: 25, driftPp: -15 },
      etfs: { actualPct: 25, targetPct: 25, driftPp: 0 },
      gold: { actualPct: 10, targetPct: 10, driftPp: 0 },
      bonds: { actualPct: 3, targetPct: 10, driftPp: -7 },
      stocks: { actualPct: 2, targetPct: 5, driftPp: -3 },
    },
    moves: {
      sells: [
        {
          symbol: "BTC",
          class: "crypto",
          bucket: "crypto",
          venue: "mexc",
          amountEur: 1500,
          unrealizedPnlEur: -300,
        },
        {
          symbol: "MSCI World",
          class: "etfs",
          bucket: "traditional",
          venue: "trade-republic",
          amountEur: 500,
          unrealizedPnlEur: 100,
        },
      ],
      buys: [
        {
          symbol: "ETH",
          class: "crypto",
          venue: "binance",
          amountEur: 800,
        },
        // Clase vacía bonds — needsStrategyPick.
        {
          symbol: null,
          class: "bonds",
          venue: "trade-republic",
          amountEur: 700,
          needsStrategyPick: true,
        },
      ],
      cashDeployEur: 1000,
      executionOrder: "sells_first",
    },
    fiscal: {
      totalGainEur: 100,
      totalLossEur: 300,
      netGainCryptoEur: 0,
      netGainTraditionalEur: 100,
      realizedYtdEur: 0,
      irpfEstimateEur: 19,
      effectiveRate: 0.19,
      notes: [],
    },
    coverage: {
      capitalAvailableEur: 3000,
      capitalNeededEur: 1500,
      coveragePct: 100,
      capApplied: false,
    },
    generatedFrom: ["cash", "crypto", "bonds"],
  };
}

test("planToOrderRows: una row por cada sell/buy", () => {
  const rows = planToOrderRows(42, basePlan());
  assert.equal(rows.length, 4, "2 sells + 2 buys");
});

test("planToOrderRows: sells propagan venue y symbol", () => {
  const rows = planToOrderRows(42, basePlan());
  const sells = rows.filter((r) => r.type === "sell");
  assert.equal(sells.length, 2);
  const btc = sells.find((r) => r.assetSymbol === "BTC");
  assert.ok(btc);
  assert.equal(btc.venue, "mexc");
  assert.equal(btc.amountEur, 1500);
  assert.equal(btc.status, "pending");
  assert.equal(btc.signalId, 42);
});

test("planToOrderRows: buy con needsStrategyPick → status=needs_pick", () => {
  const rows = planToOrderRows(42, basePlan());
  const bondsBuy = rows.find((r) => r.type === "buy" && r.assetClass === "bonds");
  assert.ok(bondsBuy);
  assert.equal(bondsBuy.status, "needs_pick");
  assert.equal(bondsBuy.assetSymbol, null);
  assert.equal(bondsBuy.venue, "trade-republic");
});

test("planToOrderRows: buy con symbol válido → status=pending", () => {
  const rows = planToOrderRows(42, basePlan());
  const ethBuy = rows.find((r) => r.type === "buy" && r.assetSymbol === "ETH");
  assert.ok(ethBuy);
  assert.equal(ethBuy.status, "pending");
  assert.equal(ethBuy.venue, "binance");
});

test("planToOrderRows: plan sin moves → 0 rows", () => {
  const plan = basePlan();
  plan.moves.sells = [];
  plan.moves.buys = [];
  const rows = planToOrderRows(99, plan);
  assert.equal(rows.length, 0);
});

test("ORDER_EXPIRATION_DAYS: ventana razonable (7-30 días)", () => {
  assert.ok(ORDER_EXPIRATION_DAYS >= 7 && ORDER_EXPIRATION_DAYS <= 30);
});
