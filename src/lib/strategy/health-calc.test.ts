import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveGoalTarget, emergencyTargetEur } from "./health-calc.ts";

test("emergencyTargetEur: multiplica fixed expenses × months", () => {
  assert.equal(emergencyTargetEur({ monthlyFixedExpenses: 1768, emergencyMonths: 5 }), 8840);
});

test("emergencyTargetEur: cambiar monthlyFixedExpenses mueve el target", () => {
  const before = emergencyTargetEur({ monthlyFixedExpenses: 1768, emergencyMonths: 5 });
  const after = emergencyTargetEur({ monthlyFixedExpenses: 2000, emergencyMonths: 5 });
  assert.equal(after - before, (2000 - 1768) * 5);
});

test("emergencyTargetEur: cambiar emergencyMonths mueve el target", () => {
  const before = emergencyTargetEur({ monthlyFixedExpenses: 1768, emergencyMonths: 5 });
  const after = emergencyTargetEur({ monthlyFixedExpenses: 1768, emergencyMonths: 6 });
  assert.equal(after - before, 1768);
});

test("emergencyTargetEur: valores negativos/0 → 0", () => {
  assert.equal(emergencyTargetEur({ monthlyFixedExpenses: 0, emergencyMonths: 5 }), 0);
  assert.equal(emergencyTargetEur({ monthlyFixedExpenses: -100, emergencyMonths: 5 }), 0);
});

test("effectiveGoalTarget: emergency_fund ignora goal.targetValue stale", () => {
  const profile = { monthlyFixedExpenses: 1768, emergencyMonths: 5 };
  const goalStale = { id: 1, type: "emergency_fund" as const, targetValue: 6643 };
  assert.equal(effectiveGoalTarget(goalStale, profile), 8840);
});

test("effectiveGoalTarget: net_worth respeta goal.targetValue", () => {
  const profile = { monthlyFixedExpenses: 1768, emergencyMonths: 5 };
  const g = { id: 2, type: "net_worth" as const, targetValue: 25000 };
  assert.equal(effectiveGoalTarget(g, profile), 25000);
});

test("effectiveGoalTarget: asset_target respeta goal.targetValue", () => {
  const profile = { monthlyFixedExpenses: 1768, emergencyMonths: 5 };
  const g = { id: 3, type: "asset_target" as const, targetValue: 0.05 };
  assert.equal(effectiveGoalTarget(g, profile), 0.05);
});

test("effectiveGoalTarget: custom respeta goal.targetValue", () => {
  const profile = { monthlyFixedExpenses: 1768, emergencyMonths: 5 };
  const g = { id: 4, type: "custom" as const, targetValue: 20 };
  assert.equal(effectiveGoalTarget(g, profile), 20);
});
