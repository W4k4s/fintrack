import { test } from "node:test";
import assert from "node:assert/strict";
import { basisBoost, cryptoMultiplier, fundingBoost, fgBaseMultiplier } from "./multipliers.ts";
import type { FundingRate } from "./market/funding.ts";
import type { BasisSnapshot } from "./market/basis.ts";

function funding(rate: number): FundingRate {
  return { asset: "BTC", symbol: "BTCUSDT", rate, nextFundingTime: 0 };
}

function basis(basisPct: number): BasisSnapshot {
  return {
    asset: "BTC",
    spotPrice: 100000,
    futurePrice: 100000 * (1 + basisPct / 100),
    basisPct,
    daysToExpiry: 90,
    instrumentName: "BTC-MOCK",
    asOf: Date.now(),
  };
}

test("basisBoost: backwardation fuerte → +0.20", () => {
  assert.equal(basisBoost(-0.5), 0.2);
  assert.equal(basisBoost(-1.5), 0.2);
});

test("basisBoost: contango sano → 0", () => {
  assert.equal(basisBoost(0), 0);
  assert.equal(basisBoost(1.5), 0);
  assert.equal(basisBoost(2.99), 0);
});

test("basisBoost: contango alto ≥3% → -0.15", () => {
  assert.equal(basisBoost(3), -0.15);
  assert.equal(basisBoost(5), -0.15);
});

test("cryptoMultiplier: miedo extremo + backwardation → topado en 2.5 (clamp)", () => {
  // fg 20 → 2.0. funding -0.0003 → +0.25. basis -1.0 → +0.2. raw = 2.45 < 2.5.
  const r = cryptoMultiplier(20, funding(-0.0003), basis(-1));
  assert.equal(r.fgMult, 2.0);
  assert.equal(r.fundingBoost, 0.25);
  assert.equal(r.basisBoost, 0.2);
  assert.ok(r.value <= 2.5);
  assert.ok(Math.abs(r.value - 2.45) < 1e-9);
});

test("cryptoMultiplier: codicia extrema + contango alto → piso 0.5", () => {
  // fg 80 → 0.5. funding 0.001 → -0.15. basis 4 → -0.15. raw = 0.2 → clamp 0.5.
  const r = cryptoMultiplier(80, funding(0.001), basis(4));
  assert.equal(r.fgMult, 0.5);
  assert.equal(r.fundingBoost, -0.15);
  assert.equal(r.basisBoost, -0.15);
  assert.equal(r.value, 0.5);
});

test("cryptoMultiplier: basis null → comportamiento pre-Fase 6 idéntico", () => {
  const r = cryptoMultiplier(30, funding(0), null);
  assert.equal(r.basisBoost, 0);
  // fgMult 1.5 + fundingBoost 0 = 1.5
  assert.equal(r.value, 1.5);
});

test("fgBaseMultiplier: continuidad", () => {
  assert.equal(fgBaseMultiplier(0), 2.0);
  assert.equal(fgBaseMultiplier(24), 2.0);
  assert.equal(fgBaseMultiplier(25), 1.5);
  assert.equal(fgBaseMultiplier(50), 1.0);
  assert.equal(fgBaseMultiplier(75), 0.5);
});

test("fundingBoost: comportamiento legacy preservado", () => {
  assert.equal(fundingBoost(-0.0003), 0.25);
  assert.equal(fundingBoost(0), 0);
  assert.equal(fundingBoost(0.001), -0.15);
});
