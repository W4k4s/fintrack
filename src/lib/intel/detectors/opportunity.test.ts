import { test } from "node:test";
import assert from "node:assert/strict";

import { __internal, type Catalyst } from "./opportunity.ts";

const { parseCatalystDate, entryWindowPct, nearestUpcomingCatalyst, severityFromHits } = __internal;

// ---------------------------------------------------------------------------
// parseCatalystDate
// ---------------------------------------------------------------------------

test("parseCatalystDate: YYYY-MM retorna primer día del mes UTC", () => {
  const d = parseCatalystDate("2026-05");
  assert.ok(d instanceof Date);
  assert.equal(d!.toISOString(), "2026-05-01T00:00:00.000Z");
});

test("parseCatalystDate: YYYY-QN retorna primer día del trimestre", () => {
  assert.equal(parseCatalystDate("2026-Q1")!.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(parseCatalystDate("2026-Q2")!.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(parseCatalystDate("2026-Q3")!.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(parseCatalystDate("2026-Q4")!.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("parseCatalystDate: YYYY-MM-DD ISO directo", () => {
  const d = parseCatalystDate("2026-04-30");
  assert.equal(d!.toISOString(), "2026-04-30T00:00:00.000Z");
});

test("parseCatalystDate: formato inválido retorna null", () => {
  assert.equal(parseCatalystDate("next month"), null);
  assert.equal(parseCatalystDate("2026"), null);
  assert.equal(parseCatalystDate("2026-13"), null);
  assert.equal(parseCatalystDate(""), null);
});

// ---------------------------------------------------------------------------
// entryWindowPct
// ---------------------------------------------------------------------------

test("entryWindowPct: current 5% por debajo → -5 dentro de ventana", () => {
  assert.equal(entryWindowPct(95, 100), -5);
});

test("entryWindowPct: current justo en entry → 0 (incluido)", () => {
  assert.equal(entryWindowPct(100, 100), 0);
});

test("entryWindowPct: exactamente -10% incluido", () => {
  assert.equal(entryWindowPct(90, 100), -10);
});

test("entryWindowPct: fuera de ventana (más de -10%) → null", () => {
  assert.equal(entryWindowPct(85, 100), null);
});

test("entryWindowPct: current por encima de entry → null", () => {
  assert.equal(entryWindowPct(101, 100), null);
});

test("entryWindowPct: entryPrice inválido → null", () => {
  assert.equal(entryWindowPct(100, 0), null);
  assert.equal(entryWindowPct(100, -10), null);
  assert.equal(entryWindowPct(NaN, 100), null);
});

// ---------------------------------------------------------------------------
// nearestUpcomingCatalyst
// ---------------------------------------------------------------------------

test("nearestUpcomingCatalyst: ninguno dentro de 30d → null", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  const catalysts: Catalyst[] = [{ event: "earnings", date_estimate: "2026-04-30" }];
  assert.equal(nearestUpcomingCatalyst(catalysts, now), null);
});

test("nearestUpcomingCatalyst: evento en 20d dispara", () => {
  const now = new Date("2026-04-10T00:00:00Z");
  const catalysts: Catalyst[] = [{ event: "earnings Q1", date_estimate: "2026-04-30" }];
  const hit = nearestUpcomingCatalyst(catalysts, now);
  assert.ok(hit);
  assert.equal(hit!.daysUntil, 20);
  assert.equal(hit!.catalyst.event, "earnings Q1");
});

test("nearestUpcomingCatalyst: elige el más próximo cuando hay varios", () => {
  const now = new Date("2026-04-10T00:00:00Z");
  const catalysts: Catalyst[] = [
    { event: "FOMC", date_estimate: "2026-05-01" }, // 21d
    { event: "earnings", date_estimate: "2026-04-20" }, // 10d
    { event: "lejano", date_estimate: "2026-07-01" }, // fuera ventana
  ];
  const hit = nearestUpcomingCatalyst(catalysts, now);
  assert.equal(hit!.daysUntil, 10);
  assert.equal(hit!.catalyst.event, "earnings");
});

test("nearestUpcomingCatalyst: catalizador en el pasado se ignora", () => {
  const now = new Date("2026-04-10T00:00:00Z");
  const catalysts: Catalyst[] = [{ event: "past", date_estimate: "2026-04-01" }];
  assert.equal(nearestUpcomingCatalyst(catalysts, now), null);
});

test("nearestUpcomingCatalyst: fechas inválidas o undefined → null sin throw", () => {
  const now = new Date("2026-04-10T00:00:00Z");
  assert.equal(nearestUpcomingCatalyst(undefined, now), null);
  assert.equal(nearestUpcomingCatalyst([], now), null);
  assert.equal(
    nearestUpcomingCatalyst([{ event: "x", date_estimate: "soon" }], now),
    null,
  );
});

test("nearestUpcomingCatalyst: Q2 vs now en abril = hit inmediato", () => {
  const now = new Date("2026-03-20T00:00:00Z");
  const catalysts: Catalyst[] = [{ event: "Q2 guidance", date_estimate: "2026-Q2" }];
  const hit = nearestUpcomingCatalyst(catalysts, now);
  assert.ok(hit);
  assert.equal(hit!.daysUntil, 12); // 2026-04-01 - 2026-03-20
});

// ---------------------------------------------------------------------------
// severityFromHits
// ---------------------------------------------------------------------------

test("severityFromHits: 0 hits → null (no signal)", () => {
  assert.equal(severityFromHits(0), null);
});

test("severityFromHits: 1 hit → med", () => {
  assert.equal(severityFromHits(1), "med");
});

test("severityFromHits: 2 hits → high", () => {
  assert.equal(severityFromHits(2), "high");
});

test("severityFromHits: 4 hits → high (no escala a critical en v1)", () => {
  assert.equal(severityFromHits(4), "high");
});
