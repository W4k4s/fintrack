import { test } from "node:test";
import assert from "node:assert/strict";
import { researchTtlCutoffIso, RESEARCH_TTL_DAYS } from "./tracked-aliases.ts";

test("researchTtlCutoffIso devuelve N días antes en UTC", () => {
  const now = new Date("2026-04-21T12:00:00.000Z");
  const cutoff = researchTtlCutoffIso(now);
  assert.equal(cutoff, "2026-04-14T12:00:00.000Z");
  assert.equal(RESEARCH_TTL_DAYS, 7);
});

test("researchTtlCutoffIso cruza mes correctamente", () => {
  const now = new Date("2026-05-03T00:00:00.000Z");
  const cutoff = researchTtlCutoffIso(now);
  assert.equal(cutoff, "2026-04-26T00:00:00.000Z");
});

test("researchTtlCutoffIso cruza año correctamente", () => {
  const now = new Date("2026-01-03T10:30:00.000Z");
  const cutoff = researchTtlCutoffIso(now);
  assert.equal(cutoff, "2025-12-27T10:30:00.000Z");
});
