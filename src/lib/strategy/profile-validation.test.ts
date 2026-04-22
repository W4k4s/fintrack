import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfileUpdate } from "./profile-validation.ts";
import { DEFAULT_POLICIES_V2, serializePolicies } from "./policies.ts";

test("validateProfileUpdate: body no-objeto → error", () => {
  const r = validateProfileUpdate(null);
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: body vacío → acepta (update no-op)", () => {
  const r = validateProfileUpdate({});
  assert.equal(r.ok, true);
});

test("validateProfileUpdate: acepta id + todos los campos R1", () => {
  const body = {
    id: 1,
    tagline: "Core + Satellite",
    philosophy: "Núcleo + satélites con tesis",
    policiesJson: serializePolicies(DEFAULT_POLICIES_V2),
    monthlyFixedExpenses: 1768,
    emergencyMonths: 5,
  };
  const r = validateProfileUpdate(body);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.id, 1);
    assert.equal(r.value.tagline, "Core + Satellite");
    assert.equal(r.value.monthlyFixedExpenses, 1768);
    assert.equal(r.value.emergencyMonths, 5);
  }
});

test("validateProfileUpdate: policiesJson no-JSON → 400", () => {
  const r = validateProfileUpdate({ policiesJson: "{not valid json" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /policiesJson no es JSON/);
});

test("validateProfileUpdate: policiesJson con shape inválido → 400", () => {
  const r = validateProfileUpdate({ policiesJson: JSON.stringify({ crypto: { pauseAbovePct: 200 } }) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /policiesJson inválido/);
});

test("validateProfileUpdate: policiesJson null aceptado (reset a default)", () => {
  const r = validateProfileUpdate({ policiesJson: null });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.policiesJson, null);
});

test("validateProfileUpdate: monthlyFixedExpenses negativo → error", () => {
  const r = validateProfileUpdate({ monthlyFixedExpenses: -100 });
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: emergencyMonths no entero → error", () => {
  const r = validateProfileUpdate({ emergencyMonths: 3.5 });
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: riskProfile fuera de enum → error", () => {
  const r = validateProfileUpdate({ riskProfile: "yolo" });
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: targetCash > 100 → error", () => {
  const r = validateProfileUpdate({ targetCash: 120 });
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: ignora campos desconocidos sin romper", () => {
  const r = validateProfileUpdate({ id: 1, foo: "bar", baz: 42 });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { id: 1 });
});

test("validateProfileUpdate: tagline demasiado largo → error", () => {
  const r = validateProfileUpdate({ tagline: "x".repeat(400) });
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: philosophy demasiado largo → error", () => {
  const r = validateProfileUpdate({ philosophy: "x".repeat(6000) });
  assert.equal(r.ok, false);
});

test("validateProfileUpdate: notes nullable", () => {
  const r1 = validateProfileUpdate({ notes: null });
  assert.equal(r1.ok, true);
  const r2 = validateProfileUpdate({ notes: "texto libre" });
  assert.equal(r2.ok, true);
});
