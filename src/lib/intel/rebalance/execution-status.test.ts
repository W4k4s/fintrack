import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyExecution,
  partialPct,
  PARTIAL_THRESHOLD_RATIO,
} from "./execution-status.ts";

test("classifyExecution — actual=null → dismissed", () => {
  assert.equal(classifyExecution(null, 100), "dismissed");
});

test("classifyExecution — actual=0 → dismissed", () => {
  assert.equal(classifyExecution(0, 100), "dismissed");
});

test("classifyExecution — actual negativo → dismissed", () => {
  assert.equal(classifyExecution(-5, 100), "dismissed");
});

test("classifyExecution — actual >= planned*0.8 → executed", () => {
  assert.equal(classifyExecution(80, 100), "executed");
  assert.equal(classifyExecution(100, 100), "executed");
  assert.equal(classifyExecution(150, 100), "executed"); // overshoot OK
});

test("classifyExecution — actual < planned*0.8 → partial", () => {
  assert.equal(classifyExecution(79, 100), "partial");
  assert.equal(classifyExecution(1, 100), "partial");
});

test("classifyExecution — planned=0 → executed (edge case)", () => {
  assert.equal(classifyExecution(10, 0), "executed");
});

test("PARTIAL_THRESHOLD_RATIO — es el 80%", () => {
  assert.equal(PARTIAL_THRESHOLD_RATIO, 0.8);
});

test("partialPct — ratio redondeado", () => {
  assert.equal(partialPct(50, 100), 50);
  assert.equal(partialPct(33, 100), 33);
  assert.equal(partialPct(200, 450), 44);
  assert.equal(partialPct(100, 100), 100);
});

test("partialPct — planned=0 → 100 (edge)", () => {
  assert.equal(partialPct(50, 0), 100);
});
