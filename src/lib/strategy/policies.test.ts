import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICIES_V2,
  parsePolicies,
  serializePolicies,
  validatePolicies,
  type StrategyPolicies,
} from "./policies.ts";

test("parsePolicies(null) devuelve DEFAULT_POLICIES_V2", () => {
  const p = parsePolicies(null);
  assert.deepEqual(p, DEFAULT_POLICIES_V2);
});

test("parsePolicies(undefined) devuelve DEFAULT_POLICIES_V2", () => {
  const p = parsePolicies(undefined);
  assert.deepEqual(p, DEFAULT_POLICIES_V2);
});

test("parsePolicies('') devuelve DEFAULT_POLICIES_V2", () => {
  const p = parsePolicies("");
  assert.deepEqual(p, DEFAULT_POLICIES_V2);
});

test("parsePolicies JSON malformado NO lanza y devuelve defaults", () => {
  const p = parsePolicies("{not valid json");
  assert.deepEqual(p, DEFAULT_POLICIES_V2);
});

test("parsePolicies objeto vacío no valida y devuelve defaults", () => {
  const p = parsePolicies("{}");
  assert.deepEqual(p, DEFAULT_POLICIES_V2);
});

test("parsePolicies con shape V2 válido devuelve los valores parseados", () => {
  const blob = serializePolicies(DEFAULT_POLICIES_V2);
  const p = parsePolicies(blob);
  assert.deepEqual(p, DEFAULT_POLICIES_V2);
});

test("round-trip serialize/parse preserva datos", () => {
  const custom: StrategyPolicies = {
    crypto: { pauseAbovePct: 20, btcOnlyBetween: [16, 20], fullBelowPct: 16 },
    multiplier: { fgThreshold: 30, appliesTo: ["BTC", "ETH"], requiresCryptoUnderPct: 20 },
    thematic: { maxPositionPct: 5, maxOpen: 6, requireThesisFields: ["entryPrice"] },
  };
  const blob = serializePolicies(custom);
  const back = parsePolicies(blob);
  assert.deepEqual(back, custom);
});

test("validatePolicies rechaza pauseAbovePct > 100", () => {
  const bad = { ...DEFAULT_POLICIES_V2, crypto: { ...DEFAULT_POLICIES_V2.crypto, pauseAbovePct: 150 } };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});

test("validatePolicies rechaza pauseAbovePct negativo", () => {
  const bad = { ...DEFAULT_POLICIES_V2, crypto: { ...DEFAULT_POLICIES_V2.crypto, pauseAbovePct: -5 } };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});

test("validatePolicies rechaza btcOnlyBetween con longitud distinta de 2", () => {
  const bad = { ...DEFAULT_POLICIES_V2, crypto: { ...DEFAULT_POLICIES_V2.crypto, btcOnlyBetween: [15] } };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});

test("validatePolicies rechaza btcOnlyBetween con low >= high", () => {
  const bad = { ...DEFAULT_POLICIES_V2, crypto: { ...DEFAULT_POLICIES_V2.crypto, btcOnlyBetween: [17, 15] } };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});

test("validatePolicies rechaza multiplier.appliesTo vacío", () => {
  const bad = { ...DEFAULT_POLICIES_V2, multiplier: { ...DEFAULT_POLICIES_V2.multiplier, appliesTo: [] } };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});

test("validatePolicies rechaza thematic.maxOpen no entero", () => {
  const bad = { ...DEFAULT_POLICIES_V2, thematic: { ...DEFAULT_POLICIES_V2.thematic, maxOpen: 3.5 } };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});

test("validatePolicies acepta shape completo V2 default", () => {
  const r = validatePolicies(DEFAULT_POLICIES_V2);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, DEFAULT_POLICIES_V2);
});

test("validatePolicies rechaza null", () => {
  const r = validatePolicies(null);
  assert.equal(r.ok, false);
});

test("validatePolicies rechaza falta de bloque crypto", () => {
  const bad = { multiplier: DEFAULT_POLICIES_V2.multiplier, thematic: DEFAULT_POLICIES_V2.thematic };
  const r = validatePolicies(bad);
  assert.equal(r.ok, false);
});
