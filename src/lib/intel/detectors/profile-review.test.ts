import { test } from "node:test";
import assert from "node:assert/strict";

// Aislamos la función median+quarterKey del detector importando __internal.
// La lógica de DB se cubre por los tests e2e manuales vía tick real.

import { __internal } from "./profile-review.ts";

test("median: tamaño impar", () => {
  assert.equal(__internal.median([1, 3, 2]), 2);
});

test("median: tamaño par promedia los dos centrales", () => {
  assert.equal(__internal.median([1, 2, 3, 4]), 2.5);
});

test("median: vacío = 0", () => {
  assert.equal(__internal.median([]), 0);
});

test("median: ya ordenado", () => {
  assert.equal(__internal.median([1, 2, 3, 4, 5]), 3);
});

test("quarterKey: Q1", () => {
  const d = new Date("2026-01-15T00:00:00Z");
  assert.equal(__internal.quarterKey(d), "2026-Q1");
});

test("quarterKey: Q2/Q3/Q4", () => {
  assert.equal(__internal.quarterKey(new Date("2026-04-01T00:00:00Z")), "2026-Q2");
  assert.equal(__internal.quarterKey(new Date("2026-07-31T00:00:00Z")), "2026-Q3");
  assert.equal(__internal.quarterKey(new Date("2026-12-31T00:00:00Z")), "2026-Q4");
});
