import { test } from "node:test";
import assert from "node:assert/strict";

import { evalThesisRules, addMonthsUTC, __internal } from "./thesis-watch.ts";

const { windowKeyForScope } = __internal;

// ---------------------------------------------------------------------------
// addMonthsUTC
// ---------------------------------------------------------------------------

test("addMonthsUTC: suma 6 meses preservando día", () => {
  const d = new Date("2026-01-15T10:00:00Z");
  assert.equal(addMonthsUTC(d, 6).toISOString(), "2026-07-15T10:00:00.000Z");
});

test("addMonthsUTC: 31 enero + 1 mes → 28/29 feb (último día)", () => {
  // 2026 no es bisiesto → febrero tiene 28 días.
  const d = new Date("2026-01-31T00:00:00Z");
  assert.equal(addMonthsUTC(d, 1).toISOString(), "2026-02-28T00:00:00.000Z");
});

test("addMonthsUTC: wrap de año", () => {
  const d = new Date("2026-08-10T00:00:00Z");
  assert.equal(addMonthsUTC(d, 6).toISOString(), "2027-02-10T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// evalThesisRules — stop vs near_stop (mutuamente excluyentes)
// ---------------------------------------------------------------------------

test("evalThesisRules: stop pinchado → thesis_stop_hit critical, sin near_stop", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 90,
    stopPrice: 92,
    targetPrice: null,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].scope, "thesis_stop_hit");
  assert.equal(hits[0].severity, "critical");
});

test("evalThesisRules: precio justo en stop = stop_hit (<=)", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 92,
    stopPrice: 92,
    targetPrice: null,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.equal(hits[0].scope, "thesis_stop_hit");
});

test("evalThesisRules: precio 3% sobre stop → near_stop med (no stop_hit)", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 94.76, // 92 * 1.03
    stopPrice: 92,
    targetPrice: null,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].scope, "thesis_near_stop");
  assert.equal(hits[0].severity, "med");
});

test("evalThesisRules: precio 6% sobre stop → ninguna regla de stop (fuera de umbral near)", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 97.52, // 92 * 1.06
    stopPrice: 92,
    targetPrice: null,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.equal(hits.filter((h) => h.scope === "thesis_near_stop").length, 0);
  assert.equal(hits.filter((h) => h.scope === "thesis_stop_hit").length, 0);
});

// ---------------------------------------------------------------------------
// evalThesisRules — target
// ---------------------------------------------------------------------------

test("evalThesisRules: precio sobre target → thesis_target_hit high", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 160,
    targetPrice: 150,
    stopPrice: null,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].scope, "thesis_target_hit");
  assert.equal(hits[0].severity, "high");
});

// ---------------------------------------------------------------------------
// evalThesisRules — expired
// ---------------------------------------------------------------------------

test("evalThesisRules: horizonte superado → thesis_expired med", () => {
  const hits = evalThesisRules({
    now: new Date("2026-10-21T00:00:00Z"),
    currentPrice: 100,
    targetPrice: null,
    stopPrice: null,
    entryDate: "2026-01-15T00:00:00Z",
    timeHorizonMonths: 6, // deadline 2026-07-15 — ya pasó
  });
  assert.ok(hits.some((h) => h.scope === "thesis_expired"));
  const exp = hits.find((h) => h.scope === "thesis_expired")!;
  assert.equal(exp.severity, "med");
  assert.equal(exp.detail.daysOverdue, 98); // 2026-10-21 - 2026-07-15
});

test("evalThesisRules: entry reciente no expira", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 100,
    targetPrice: null,
    stopPrice: null,
    entryDate: "2026-01-15T00:00:00Z",
    timeHorizonMonths: 12,
  });
  assert.equal(hits.filter((h) => h.scope === "thesis_expired").length, 0);
});

test("evalThesisRules: entryDate inválido no crashea", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 100,
    targetPrice: null,
    stopPrice: null,
    entryDate: "no es fecha",
    timeHorizonMonths: 6,
  });
  assert.equal(hits.filter((h) => h.scope === "thesis_expired").length, 0);
});

// ---------------------------------------------------------------------------
// evalThesisRules — combinaciones
// ---------------------------------------------------------------------------

test("evalThesisRules: stop_hit + expired a la vez → ambos signals", () => {
  const hits = evalThesisRules({
    now: new Date("2026-10-21T00:00:00Z"),
    currentPrice: 80,
    stopPrice: 92,
    targetPrice: null,
    entryDate: "2026-01-15T00:00:00Z",
    timeHorizonMonths: 6,
  });
  assert.equal(hits.length, 2);
  const scopes = new Set(hits.map((h) => h.scope));
  assert.ok(scopes.has("thesis_stop_hit"));
  assert.ok(scopes.has("thesis_expired"));
  assert.ok(!scopes.has("thesis_near_stop"));
});

test("evalThesisRules: target + near_stop imposible (misma serie de precios)", () => {
  // Si current >= target ∧ current <= stop*1.05 ⇒ target <= stop*1.05, lo
  // que sería una tesis mal configurada. Aquí el test solo comprueba que el
  // eval no invente scopes imposibles para parámetros sanos.
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: 160,
    targetPrice: 150,
    stopPrice: 100,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.ok(hits.some((h) => h.scope === "thesis_target_hit"));
  assert.ok(!hits.some((h) => h.scope === "thesis_near_stop"));
});

test("evalThesisRules: sin precio actual → ninguna regla de precio dispara", () => {
  const hits = evalThesisRules({
    now: new Date("2026-04-21T00:00:00Z"),
    currentPrice: null,
    targetPrice: 150,
    stopPrice: 100,
    entryDate: null,
    timeHorizonMonths: null,
  });
  assert.equal(hits.length, 0);
});

// ---------------------------------------------------------------------------
// windowKeyForScope
// ---------------------------------------------------------------------------

test("windowKeyForScope: expired → weekly, resto → daily", () => {
  const now = new Date("2026-04-21T12:00:00Z");
  assert.match(windowKeyForScope("thesis_expired", now), /^\d{4}-W\d{2}$/);
  assert.match(windowKeyForScope("thesis_stop_hit", now), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(windowKeyForScope("thesis_target_hit", now), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(windowKeyForScope("thesis_near_stop", now), /^\d{4}-\d{2}-\d{2}$/);
});
