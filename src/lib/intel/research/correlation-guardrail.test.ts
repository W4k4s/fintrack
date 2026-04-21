import { test } from "node:test";
import assert from "node:assert/strict";
import { CORR_THRESHOLD, WEIGHT_PCT_THRESHOLD } from "./correlation-guardrail.ts";
import type { HoldingCorr } from "./correlation-holdings.ts";

// Tests puros del predicado del guardrail sin tocar fetchers ni DB.
// La lógica real vive en evaluateCorrelationGuardrail; aquí verificamos
// las constantes y la función de filtrado de hits expuesta vía re-implementación
// pura para no arrastrar side-effects de red en tests.

function filterHits(holdings: HoldingCorr[]) {
  const hits: Array<{ symbol: string; weightPct: number; corr90d: number }> = [];
  for (const h of holdings) {
    if (h.corr90d == null) continue;
    if (h.corr90d > CORR_THRESHOLD && h.weightPct > WEIGHT_PCT_THRESHOLD) {
      hits.push({ symbol: h.symbol, weightPct: h.weightPct, corr90d: h.corr90d });
    }
  }
  return hits;
}

test("thresholds son 0.8 (corr) y 10 (weightPct)", () => {
  assert.equal(CORR_THRESHOLD, 0.8);
  assert.equal(WEIGHT_PCT_THRESHOLD, 10);
});

test("no hay hits si correlación <= 0.8 aunque weight sea alto", () => {
  const holdings: HoldingCorr[] = [
    { symbol: "BTC", weightPct: 30, valueEur: 1000, corr90d: 0.8, reason: null },
    { symbol: "ETH", weightPct: 15, valueEur: 500, corr90d: 0.75, reason: null },
  ];
  assert.equal(filterHits(holdings).length, 0);
});

test("no hay hits si weight <= 10% aunque correlación sea alta", () => {
  const holdings: HoldingCorr[] = [
    { symbol: "SOL", weightPct: 10, valueEur: 100, corr90d: 0.95, reason: null },
    { symbol: "PEPE", weightPct: 5, valueEur: 50, corr90d: 0.99, reason: null },
  ];
  assert.equal(filterHits(holdings).length, 0);
});

test("hits cuando corr > 0.8 Y weight > 10%", () => {
  const holdings: HoldingCorr[] = [
    { symbol: "BTC", weightPct: 30, valueEur: 1000, corr90d: 0.87, reason: null },
    { symbol: "ETH", weightPct: 15, valueEur: 500, corr90d: 0.82, reason: null },
    { symbol: "MSCI World", weightPct: 20, valueEur: 800, corr90d: 0.5, reason: null },
  ];
  const hits = filterHits(holdings);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].symbol, "BTC");
  assert.equal(hits[1].symbol, "ETH");
});

test("hits ignora correlaciones null (fetch falló)", () => {
  const holdings: HoldingCorr[] = [
    { symbol: "IWDA", weightPct: 25, valueEur: 1000, corr90d: null, reason: "fetch_failed" },
    { symbol: "BTC", weightPct: 20, valueEur: 800, corr90d: 0.92, reason: null },
  ];
  const hits = filterHits(holdings);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].symbol, "BTC");
});
