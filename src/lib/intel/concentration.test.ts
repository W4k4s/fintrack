import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregatePositions,
  computeConcentration,
  evaluateConcentration,
  hitsToSeverity,
  hhiLabel,
  CONCENTRATION_THRESHOLDS,
} from "./concentration.ts";

test("aggregatePositions — suma por (symbol, assetClass)", () => {
  const out = aggregatePositions([
    { symbol: "BTC", assetClass: "crypto", valueEur: 1000 },
    { symbol: "BTC", assetClass: "crypto", valueEur: 500 },
    { symbol: "ETH", assetClass: "crypto", valueEur: 200 },
  ]);
  out.sort((a, b) => b.valueEur - a.valueEur);
  assert.equal(out.length, 2);
  assert.equal(out[0].symbol, "BTC");
  assert.equal(out[0].valueEur, 1500);
});

test("computeConcentration — vacío", () => {
  const s = computeConcentration([]);
  assert.equal(s.netWorthEur, 0);
  assert.equal(s.topShare.n1, 0);
  assert.equal(s.hhi, 0);
  assert.equal(s.topPosition, null);
});

test("computeConcentration — top shares ordenadas desc", () => {
  const s = computeConcentration([
    { symbol: "A", assetClass: "x", valueEur: 100 },
    { symbol: "B", assetClass: "x", valueEur: 300 },
    { symbol: "C", assetClass: "x", valueEur: 600 },
  ]);
  assert.equal(s.netWorthEur, 1000);
  assert.equal(s.topPosition?.symbol, "C");
  assert.equal(s.topShare.n1, 60);
  assert.equal(s.topShare.n3, 100);
  assert.equal(s.positions[0].symbol, "C");
});

test("computeConcentration — HHI igual concentrado", () => {
  // Monopolio 100% → HHI = 10000
  const mono = computeConcentration([{ symbol: "X", assetClass: null, valueEur: 500 }]);
  assert.equal(mono.hhi, 10000);
  // 10 iguales → HHI = 1000
  const diverse = computeConcentration(
    Array.from({ length: 10 }, (_, i) => ({ symbol: `A${i}`, assetClass: null, valueEur: 100 })),
  );
  assert.equal(Math.round(diverse.hhi), 1000);
});

test("computeConcentration — ignora valores <=0", () => {
  const s = computeConcentration([
    { symbol: "A", assetClass: null, valueEur: 100 },
    { symbol: "B", assetClass: null, valueEur: 0 },
    { symbol: "C", assetClass: null, valueEur: -50 },
  ]);
  assert.equal(s.positions.length, 1);
  assert.equal(s.netWorthEur, 100);
});

test("evaluateConcentration — sin hits si bajo umbrales", () => {
  const snap = computeConcentration([
    { symbol: "A", assetClass: null, valueEur: 100 },
    { symbol: "B", assetClass: null, valueEur: 100 },
    { symbol: "C", assetClass: null, valueEur: 100 },
    { symbol: "D", assetClass: null, valueEur: 100 },
    { symbol: "E", assetClass: null, valueEur: 100 },
  ]);
  // top1=20%, top3=60% → top1 no dispara, top3 dispara exactamente high (>=60)
  const hits = evaluateConcentration(snap);
  // top3=60 cae en high (>=60)
  assert.ok(hits.some((h) => h.kind === "top3" && h.severity === "high"));
  assert.ok(!hits.some((h) => h.kind === "top1"));
});

test("evaluateConcentration — top-1 critical y top-3 critical", () => {
  const snap = computeConcentration([
    { symbol: "BIG", assetClass: "crypto", valueEur: 800 },
    { symbol: "A", assetClass: "crypto", valueEur: 150 },
    { symbol: "B", assetClass: "crypto", valueEur: 50 },
  ]);
  const hits = evaluateConcentration(snap);
  const top1 = hits.find((h) => h.kind === "top1");
  const top3 = hits.find((h) => h.kind === "top3");
  assert.equal(top1?.severity, "critical");
  assert.equal(top3?.severity, "critical");
  // excess top1 = (80-50)/100 * 1000 = 300
  assert.equal(Math.round(top1?.excessEur ?? 0), 300);
  // excess top3 = (100-70)/100 * 1000 = 300
  assert.equal(Math.round(top3?.excessEur ?? 0), 300);
});

test("evaluateConcentration — top-1 med, top-3 sin hit", () => {
  const snap = computeConcentration([
    { symbol: "A", assetClass: null, valueEur: 350 },
    { symbol: "B", assetClass: null, valueEur: 150 },
    { symbol: "C", assetClass: null, valueEur: 150 },
    { symbol: "D", assetClass: null, valueEur: 100 },
    { symbol: "E", assetClass: null, valueEur: 100 },
    { symbol: "F", assetClass: null, valueEur: 100 },
    { symbol: "G", assetClass: null, valueEur: 50 },
  ]);
  // netWorth=1000. top1=35%, top3=65%.
  const hits = evaluateConcentration(snap);
  const top1 = hits.find((h) => h.kind === "top1");
  const top3 = hits.find((h) => h.kind === "top3");
  assert.equal(top1?.severity, "med");
  assert.equal(top3?.severity, "high");
});

test("hitsToSeverity — selecciona el máximo", () => {
  const sev = hitsToSeverity([
    { kind: "top3", pct: 55, threshold: 50, excessEur: 0, severity: "med" },
    { kind: "top1", pct: 45, threshold: 40, excessEur: 0, severity: "high" },
  ]);
  assert.equal(sev, "high");
});

test("hitsToSeverity — sin hits → null", () => {
  assert.equal(hitsToSeverity([]), null);
});

test("hhiLabel — umbrales", () => {
  assert.equal(hhiLabel(500), "baja");
  assert.equal(hhiLabel(1499), "baja");
  assert.equal(hhiLabel(1500), "moderada");
  assert.equal(hhiLabel(2499), "moderada");
  assert.equal(hhiLabel(2500), "alta");
  assert.equal(hhiLabel(10000), "alta");
});

test("CONCENTRATION_THRESHOLDS — coherencia", () => {
  // Umbrales crecientes por severity
  assert.ok(CONCENTRATION_THRESHOLDS.top3.med < CONCENTRATION_THRESHOLDS.top3.high);
  assert.ok(CONCENTRATION_THRESHOLDS.top3.high < CONCENTRATION_THRESHOLDS.top3.critical);
  assert.ok(CONCENTRATION_THRESHOLDS.top1.med < CONCENTRATION_THRESHOLDS.top1.high);
  assert.ok(CONCENTRATION_THRESHOLDS.top1.high < CONCENTRATION_THRESHOLDS.top1.critical);
});
