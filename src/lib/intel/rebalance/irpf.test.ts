import { test } from "node:test";
import assert from "node:assert/strict";
import { irpfOnGain, irpfSeverity, TRAMOS_AEAT_2026 } from "./irpf.ts";

const approx = (actual: number, expected: number, epsilon = 0.01) => {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${expected} got ${actual} (|diff|=${Math.abs(actual - expected)})`,
  );
};

test("irpfOnGain: gain 0 → 0", () => {
  assert.equal(irpfOnGain(0, 0), 0);
});

test("irpfOnGain: gain negativa → 0 (pérdida)", () => {
  assert.equal(irpfOnGain(-1000, 0), 0);
});

test("irpfOnGain: gain íntegramente dentro tramo 0-6k (19%)", () => {
  approx(irpfOnGain(3000, 0), 570);
});

test("irpfOnGain: cruce tramo 6k → 21%", () => {
  // YTD=4000, gain=5000 → 2000*19% + 3000*21% = 380 + 630 = 1010
  approx(irpfOnGain(5000, 4000), 1010);
});

test("irpfOnGain: íntegramente tramo 6-50k (YTD ya en tramo)", () => {
  approx(irpfOnGain(5000, 10000), 1050);
});

test("irpfOnGain: cruce tramo 50k → 23%", () => {
  // YTD=49000, gain=2000 → 1000*21% + 1000*23% = 210 + 230 = 440
  approx(irpfOnGain(2000, 49000), 440);
});

test("irpfOnGain: YTD >50k (tramo 23% aplica íntegro)", () => {
  approx(irpfOnGain(3000, 55000), 690);
});

test("irpfOnGain: cruza 3 tramos consecutivos", () => {
  // YTD=0, gain=60000 → 6000*19% + 44000*21% + 10000*23% = 1140 + 9240 + 2300 = 12680
  approx(irpfOnGain(60000, 0), 12680);
});

test("irpfOnGain: tramo superior (>300k, 28%)", () => {
  // 6000*0.19 + 44000*0.21 + 150000*0.23 + 100000*0.27 + 100000*0.28 = 99880
  approx(irpfOnGain(400000, 0), 99880);
});

test("irpfOnGain: YTD muy alto (>300k) todo al 28%", () => {
  approx(irpfOnGain(10000, 350000), 2800);
});

test("TRAMOS_AEAT_2026: integridad", () => {
  assert.equal(TRAMOS_AEAT_2026.length, 5);
  assert.equal(TRAMOS_AEAT_2026[0].rate, 0.19);
  assert.equal(TRAMOS_AEAT_2026[4].to, null);
  assert.equal(TRAMOS_AEAT_2026[4].rate, 0.28);
});

test("irpfSeverity: umbrales", () => {
  assert.equal(irpfSeverity(0), "low");
  assert.equal(irpfSeverity(499), "low");
  assert.equal(irpfSeverity(500), "med");
  assert.equal(irpfSeverity(1499), "med");
  assert.equal(irpfSeverity(1500), "high");
  assert.equal(irpfSeverity(4999), "high");
  assert.equal(irpfSeverity(5000), "critical");
});
