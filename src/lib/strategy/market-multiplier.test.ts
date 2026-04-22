import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPolicyGate,
  computeCryptoAllocationPct,
  getRawDcaMultiplier,
} from "./market-multiplier.ts";
import { DEFAULT_POLICIES_V2, type StrategyPolicies } from "./policies.ts";

// ---------------------------------------------------------------------------
// getRawDcaMultiplier
// ---------------------------------------------------------------------------

test("getRawDcaMultiplier: fg ≤ threshold → 2.0 (miedo extremo)", () => {
  assert.equal(getRawDcaMultiplier(20, 24).multiplier, 2.0);
  assert.equal(getRawDcaMultiplier(24, 24).multiplier, 2.0);
});

test("getRawDcaMultiplier: fg threshold configurable", () => {
  // Si threshold sube a 30, fg=28 debe devolver 2.0 (antes con 24 daba 1.5).
  assert.equal(getRawDcaMultiplier(28, 30).multiplier, 2.0);
  assert.equal(getRawDcaMultiplier(28, 24).multiplier, 1.5);
});

test("getRawDcaMultiplier: tramos intermedios y superior", () => {
  assert.equal(getRawDcaMultiplier(35, 24).multiplier, 1.5);
  assert.equal(getRawDcaMultiplier(50, 24).multiplier, 1.0);
  assert.equal(getRawDcaMultiplier(60, 24).multiplier, 0.75);
  assert.equal(getRawDcaMultiplier(85, 24).multiplier, 0.5);
});

// ---------------------------------------------------------------------------
// applyPolicyGate
// ---------------------------------------------------------------------------

test("applyPolicyGate: crypto allocation ≥ threshold → pausa total", () => {
  const raw = { multiplier: 2.0, label: "Doblar compras" };
  const r = applyPolicyGate(raw, DEFAULT_POLICIES_V2, 18.6);
  assert.equal(r.multiplier, 1.0);
  assert.match(r.label, /Pausado/);
  assert.match(r.label, /18.6%/);
  assert.match(r.label, /17%/);
});

test("applyPolicyGate: crypto allocation < threshold + boost >1 → añade hint appliesTo", () => {
  const raw = { multiplier: 2.0, label: "Doblar compras (miedo extremo)" };
  const r = applyPolicyGate(raw, DEFAULT_POLICIES_V2, 14.5);
  assert.equal(r.multiplier, 2.0);
  assert.match(r.label, /sólo BTC/);
});

test("applyPolicyGate: crypto allocation < threshold + boost ≤1 → sin cambios", () => {
  const raw = { multiplier: 1.0, label: "Ritmo normal" };
  const r = applyPolicyGate(raw, DEFAULT_POLICIES_V2, 14.5);
  assert.equal(r.multiplier, 1.0);
  assert.equal(r.label, "Ritmo normal");
});

test("applyPolicyGate: threshold justo (== requiresCryptoUnderPct) → pausa", () => {
  const raw = { multiplier: 1.5, label: "Aumentar" };
  const r = applyPolicyGate(raw, DEFAULT_POLICIES_V2, 17.0);
  assert.equal(r.multiplier, 1.0);
  assert.match(r.label, /Pausado/);
});

test("applyPolicyGate: appliesTo vacío no añade hint spurious", () => {
  const pol: StrategyPolicies = {
    ...DEFAULT_POLICIES_V2,
    multiplier: { ...DEFAULT_POLICIES_V2.multiplier, appliesTo: [] },
  };
  const raw = { multiplier: 2.0, label: "Doblar" };
  const r = applyPolicyGate(raw, pol, 10);
  assert.equal(r.label, "Doblar");
});

// ---------------------------------------------------------------------------
// computeCryptoAllocationPct
// ---------------------------------------------------------------------------

test("computeCryptoAllocationPct: sólo suma assets en CRYPTO_SYMBOLS", () => {
  const assets = [
    { symbol: "BTC", value: 1000 },
    { symbol: "ETH", value: 500 },
    { symbol: "MSCI World", value: 2000 },
    { symbol: "Gold ETC", value: 1000 },
    { symbol: "SOL", value: 300 },
  ];
  const total = 4800;
  const pct = computeCryptoAllocationPct(assets, total);
  // crypto = 1000+500+300 = 1800 → 1800/4800 = 37.5%
  assert.ok(Math.abs(pct - 37.5) < 1e-9);
});

test("computeCryptoAllocationPct: total 0 → 0", () => {
  assert.equal(computeCryptoAllocationPct([{ symbol: "BTC", value: 100 }], 0), 0);
});

test("computeCryptoAllocationPct: total NaN/negativo → 0", () => {
  assert.equal(computeCryptoAllocationPct([{ symbol: "BTC", value: 100 }], -5), 0);
  assert.equal(computeCryptoAllocationPct([{ symbol: "BTC", value: 100 }], Number.NaN), 0);
});

test("computeCryptoAllocationPct: sin assets crypto → 0", () => {
  const assets = [
    { symbol: "MSCI World", value: 2000 },
    { symbol: "Gold ETC", value: 1000 },
  ];
  assert.equal(computeCryptoAllocationPct(assets, 3000), 0);
});

test("computeCryptoAllocationPct: value undefined se toma como 0", () => {
  const assets = [{ symbol: "BTC" }, { symbol: "ETH", value: 500 }];
  assert.ok(Math.abs(computeCryptoAllocationPct(assets, 1000) - 50) < 1e-9);
});

// ---------------------------------------------------------------------------
// Integración: raw + gate con V2 real
// ---------------------------------------------------------------------------

test("integración: fg 20 + alloc 18% V2 → pausado (ignorando raw ×2)", () => {
  const raw = getRawDcaMultiplier(20, DEFAULT_POLICIES_V2.multiplier.fgThreshold);
  const gated = applyPolicyGate(raw, DEFAULT_POLICIES_V2, 18);
  assert.equal(gated.multiplier, 1.0);
  assert.match(gated.label, /Pausado/);
});

test("integración: fg 20 + alloc 12% V2 → ×2 + hint sólo BTC", () => {
  const raw = getRawDcaMultiplier(20, DEFAULT_POLICIES_V2.multiplier.fgThreshold);
  const gated = applyPolicyGate(raw, DEFAULT_POLICIES_V2, 12);
  assert.equal(gated.multiplier, 2.0);
  assert.match(gated.label, /sólo BTC/);
});
