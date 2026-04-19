import { test } from "node:test";
import assert from "node:assert/strict";
import {
  logReturns,
  mean,
  pearson,
  pairwiseCorrelations,
  averageCorrelation,
  classifyCorrelation,
  CORRELATION_THRESHOLDS,
} from "./correlation.ts";

test("logReturns — serie de 4 → 3 retornos", () => {
  const r = logReturns([100, 110, 99, 105]);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(r[0] - Math.log(110 / 100)) < 1e-12);
});

test("logReturns — filtra valores no positivos", () => {
  const r = logReturns([100, 0, 110, -5, 120]);
  // 100→0 descartado (curr=0), 0→110 descartado (prev=0), 110→-5 descartado, -5→120 descartado
  assert.equal(r.length, 0);
});

test("mean", () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(mean([]), 0);
});

test("pearson — correlación perfecta = 1", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [2, 4, 6, 8, 10];
  assert.ok(Math.abs((pearson(xs, ys) ?? 0) - 1) < 1e-12);
});

test("pearson — correlación perfectamente negativa = -1", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [10, 8, 6, 4, 2];
  assert.ok(Math.abs((pearson(xs, ys) ?? 0) - -1) < 1e-12);
});

test("pearson — menos de 3 muestras → null", () => {
  assert.equal(pearson([1, 2], [3, 4]), null);
});

test("pearson — varianza cero → null", () => {
  assert.equal(pearson([5, 5, 5, 5], [1, 2, 3, 4]), null);
});

test("pairwiseCorrelations — 3 assets → 3 pares", () => {
  const r = pairwiseCorrelations({
    BTC: [0.01, -0.02, 0.03, 0.01, -0.01],
    ETH: [0.02, -0.01, 0.02, 0.01, -0.02],
    SOL: [0.03, -0.03, 0.04, 0.02, -0.01],
  });
  // C(3,2) = 3 pares
  assert.equal(r.length, 3);
  const pairs = r.map((p) => `${p.a}/${p.b}`).sort();
  assert.deepEqual(pairs, ["BTC/ETH", "BTC/SOL", "ETH/SOL"]);
});

test("averageCorrelation", () => {
  const pairs = [
    { a: "BTC", b: "ETH", corr: 0.9 },
    { a: "BTC", b: "SOL", corr: 0.8 },
    { a: "ETH", b: "SOL", corr: 0.85 },
  ];
  assert.ok(Math.abs((averageCorrelation(pairs) ?? 0) - 0.85) < 1e-12);
});

test("averageCorrelation — vacío → null", () => {
  assert.equal(averageCorrelation([]), null);
});

test("classifyCorrelation — umbrales", () => {
  assert.equal(classifyCorrelation(null), null);
  assert.equal(classifyCorrelation(0.5), null);
  assert.equal(classifyCorrelation(0.84), null);
  assert.equal(classifyCorrelation(0.85), "med");
  assert.equal(classifyCorrelation(0.9), "med");
  assert.equal(classifyCorrelation(0.92), "high");
  assert.equal(classifyCorrelation(0.99), "high");
});

test("CORRELATION_THRESHOLDS — med < high", () => {
  assert.ok(CORRELATION_THRESHOLDS.med < CORRELATION_THRESHOLDS.high);
});
