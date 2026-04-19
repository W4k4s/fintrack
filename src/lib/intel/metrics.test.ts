import { test } from "node:test";
import assert from "node:assert/strict";
import {
  median,
  isIgnored,
  timeToActionHours,
  computeExecutionStats,
  IGNORED_AFTER_DAYS,
} from "./metrics.ts";

const NOW = Date.parse("2026-04-19T18:00:00.000Z");

function iso(daysAgo: number): string {
  return new Date(NOW - daysAgo * 86400_000).toISOString();
}

test("median — lista vacía", () => {
  assert.equal(median([]), null);
});

test("median — impar", () => {
  assert.equal(median([3, 1, 2]), 2);
});

test("median — par", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("median — un elemento", () => {
  assert.equal(median([7]), 7);
});

test("isIgnored — resolvedAt ≠ null → false", () => {
  assert.equal(
    isIgnored({ userStatus: "unread", resolvedAt: iso(1), createdAt: iso(30) }, NOW),
    false,
  );
});

test("isIgnored — acted → false", () => {
  assert.equal(
    isIgnored({ userStatus: "acted", resolvedAt: null, createdAt: iso(30) }, NOW),
    false,
  );
});

test("isIgnored — dismissed → false", () => {
  assert.equal(
    isIgnored({ userStatus: "dismissed", resolvedAt: null, createdAt: iso(30) }, NOW),
    false,
  );
});

test("isIgnored — unread y viejo >=7d → true", () => {
  assert.equal(
    isIgnored({ userStatus: "unread", resolvedAt: null, createdAt: iso(10) }, NOW),
    true,
  );
});

test("isIgnored — read y viejo >=7d → true", () => {
  assert.equal(
    isIgnored({ userStatus: "read", resolvedAt: null, createdAt: iso(8) }, NOW),
    true,
  );
});

test("isIgnored — unread pero fresco (<7d) → false", () => {
  assert.equal(
    isIgnored({ userStatus: "unread", resolvedAt: null, createdAt: iso(3) }, NOW),
    false,
  );
});

test("isIgnored — límite exacto 7d → true", () => {
  assert.equal(
    isIgnored(
      { userStatus: "unread", resolvedAt: null, createdAt: iso(IGNORED_AFTER_DAYS) },
      NOW,
    ),
    true,
  );
});

test("timeToActionHours — acted con resolvedAt → delta en horas", () => {
  const createdAt = new Date(NOW - 6 * 3600_000).toISOString();
  const resolvedAt = new Date(NOW).toISOString();
  assert.equal(timeToActionHours({ userStatus: "acted", createdAt, resolvedAt }), 6);
});

test("timeToActionHours — no acted → null", () => {
  assert.equal(
    timeToActionHours({ userStatus: "dismissed", createdAt: iso(1), resolvedAt: iso(0) }),
    null,
  );
});

test("timeToActionHours — acted sin resolvedAt → null", () => {
  assert.equal(
    timeToActionHours({ userStatus: "acted", createdAt: iso(1), resolvedAt: null }),
    null,
  );
});

test("computeExecutionStats — vacío", () => {
  const s = computeExecutionStats([]);
  assert.equal(s.ordersTotal, 0);
  assert.equal(s.executionRate, 0);
  assert.equal(s.plannedAmountEur, 0);
});

test("computeExecutionStats — mezcla de statuses", () => {
  const s = computeExecutionStats([
    { signalId: 1, status: "executed", amountEur: 100, actualAmountEur: 95 },
    { signalId: 1, status: "executed", amountEur: 200, actualAmountEur: null },
    { signalId: 1, status: "dismissed", amountEur: 50, actualAmountEur: null },
    { signalId: 1, status: "stale", amountEur: 30, actualAmountEur: null },
    { signalId: 1, status: "pending", amountEur: 70, actualAmountEur: null },
    { signalId: 1, status: "superseded", amountEur: 500, actualAmountEur: null },
    { signalId: 1, status: "needs_pick", amountEur: 40, actualAmountEur: null },
  ]);
  assert.equal(s.ordersTotal, 7);
  assert.equal(s.ordersExecuted, 2);
  assert.equal(s.ordersDismissed, 1);
  assert.equal(s.ordersStale, 1);
  assert.equal(s.ordersPending, 1);
  assert.equal(s.ordersSuperseded, 1);
  assert.equal(s.ordersNeedsPick, 1);
  assert.equal(s.plannedAmountEur, 990);
  assert.equal(s.executedAmountEur, 95 + 200);
  // actionable = 7 - 1 superseded = 6; executionRate = 2/6
  assert.equal(s.executionRate, 2 / 6);
});

test("computeExecutionStats — solo superseded → actionable 0 → rate 0", () => {
  const s = computeExecutionStats([
    { signalId: 1, status: "superseded", amountEur: 100, actualAmountEur: null },
    { signalId: 1, status: "superseded", amountEur: 200, actualAmountEur: null },
  ]);
  assert.equal(s.executionRate, 0);
  assert.equal(s.ordersSuperseded, 2);
});

test("computeExecutionStats — executed sin actualAmountEur usa planned", () => {
  const s = computeExecutionStats([
    { signalId: 1, status: "executed", amountEur: 150, actualAmountEur: null },
  ]);
  assert.equal(s.executedAmountEur, 150);
});
