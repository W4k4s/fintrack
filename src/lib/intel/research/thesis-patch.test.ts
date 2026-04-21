import { test } from "node:test";
import assert from "node:assert/strict";

import { applyThesisPatch, type ThesisPatch } from "./thesis-patch.ts";

test("applyThesisPatch: strings corta a longitudes máximas", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { thesis: "a".repeat(2500), entryPlan: "b".repeat(600) });
  assert.equal(p.thesis?.length, 2000);
  assert.equal(p.entryPlan?.length, 500);
});

test("applyThesisPatch: ignora strings inválidos (tipos no string)", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { thesis: 123, entryPlan: null });
  assert.equal(p.thesis, undefined);
  assert.equal(p.entryPlan, undefined);
});

test("applyThesisPatch: precios numéricos pasan tal cual", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { targetPrice: 155.5, stopPrice: 92, entryPrice: 110 });
  assert.equal(p.targetPrice, 155.5);
  assert.equal(p.stopPrice, 92);
  assert.equal(p.entryPrice, 110);
});

test("applyThesisPatch: NaN/Infinity se rechazan", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { targetPrice: NaN, stopPrice: Infinity, entryPrice: -Infinity });
  assert.equal(p.targetPrice, undefined);
  assert.equal(p.stopPrice, undefined);
  assert.equal(p.entryPrice, undefined);
});

test("applyThesisPatch: timeHorizonMonths se trunca a entero", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { timeHorizonMonths: 11.8 });
  assert.equal(p.timeHorizonMonths, 11);
});

test("applyThesisPatch: entryDate ISO se normaliza", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { entryDate: "2026-04-21" });
  assert.equal(p.entryDate, "2026-04-21T00:00:00.000Z");
});

test("applyThesisPatch: entryDate inválido se ignora", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { entryDate: "no es fecha" });
  assert.equal(p.entryDate, undefined);
});

test("applyThesisPatch: body vacío no muta patch", () => {
  const p: ThesisPatch = { updatedAt: "2026-04-21T12:00:00Z" };
  applyThesisPatch(p, {});
  assert.deepEqual(p, { updatedAt: "2026-04-21T12:00:00Z" });
});

test("applyThesisPatch: preserva valores previos del patch y añade nuevos", () => {
  const p: ThesisPatch = { status: "watching" };
  applyThesisPatch(p, { targetPrice: 200, thesis: "nueva" });
  assert.equal(p.status, "watching");
  assert.equal(p.targetPrice, 200);
  assert.equal(p.thesis, "nueva");
});

test("applyThesisPatch: body con campos parciales solo copia lo enviado", () => {
  const p: ThesisPatch = {};
  applyThesisPatch(p, { stopPrice: 88 });
  assert.equal(p.stopPrice, 88);
  assert.equal(p.targetPrice, undefined);
  assert.equal(p.thesis, undefined);
});
