import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDigest, type WeeklyDigest } from "./digest-weekly.ts";

function sampleContext(
  overrides: Partial<WeeklyDigest["context"]> = {},
): WeeklyDigest["context"] {
  return {
    netWorthEur: 19053,
    netWorthDeltaEur: -250,
    netWorthDeltaPct: -1.3,
    allocation: {
      cash: { actualPct: 66.7, targetPct: 15, driftPp: 51.7 },
      crypto: { actualPct: 16.2, targetPct: 25, driftPp: -8.8 },
      etfs: { actualPct: 11.4, targetPct: 30, driftPp: -18.6 },
      gold: { actualPct: 3.3, targetPct: 10, driftPp: -6.7 },
      bonds: { actualPct: 2.3, targetPct: 10, driftPp: -7.7 },
      stocks: { actualPct: 0.1, targetPct: 10, driftPp: -9.9 },
    },
    multipliers: { crypto: 2.0, etfs: 0.9, gold: 1.0 },
    signalsBySeverity: { low: 3, med: 6, high: 2, critical: 3 },
    topUnread: [
      { id: 37, title: "Rebalance plan: desplegar 9850€", severity: "critical", scope: "drift" },
      { id: 26, title: "ETFs 11.4% vs target 30% (-18.6pp)", severity: "critical", scope: "drift" },
      { id: 24, title: "Cash 66.7% vs target 15% (+51.7pp)", severity: "critical", scope: "drift" },
    ],
    dca: { weeklyBudget: 220, thisWeekExecuted: 70, thisWeekRemaining: 150 },
    markets: { fg: 27, fgPrev: 35, btcBasisPct: 0.32, vix: 17.5 },
    ...overrides,
  };
}

test("formatDigest: incluye net worth + delta", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.includes("Net worth: 19.053€"));
  assert.ok(txt.includes("-1.3%"));
  assert.ok(txt.includes("↓"));
});

test("formatDigest: snapshot 7d ausente indica falta de baseline", () => {
  const txt = formatDigest(
    sampleContext({ netWorthDeltaPct: null, netWorthDeltaEur: 0 }),
    new Date("2026-04-19T19:00:00Z"),
  );
  assert.ok(txt.includes("snapshot 7d no disponible"));
});

test("formatDigest: marca drift alto con ⚠ y !", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  // Cash +51.7pp, Crypto -8.8pp, ETFs -18.6pp.
  // 51.7 ≥15 → ⚠. 18.6 ≥15 → ⚠. 9.9 <10 → "".
  const cashLine = txt.split("\n").find((l) => l.startsWith("Cash"))!;
  const etfsLine = txt.split("\n").find((l) => l.startsWith("ETFs"))!;
  const cryptoLine = txt.split("\n").find((l) => l.startsWith("Crypto"))!;
  assert.ok(cashLine.endsWith("⚠"));
  assert.ok(etfsLine.endsWith("⚠"));
  assert.ok(!cryptoLine.endsWith("⚠"));
});

test("formatDigest: incluye multipliers crypto/equity/gold", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.includes("Crypto 2.00x"));
  assert.ok(txt.includes("ETFs 0.90x"));
  assert.ok(txt.includes("Gold 1.00x"));
});

test("formatDigest: incluye market context (F&G, basis, VIX)", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.includes("F&G 27"));
  assert.ok(txt.includes("BTC basis 0.32%"));
  assert.ok(txt.includes("VIX 17.5"));
});

test("formatDigest: incluye totales signals por severity", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.includes("Total 14"));
  assert.ok(/🔴3/.test(txt));
});

test("formatDigest: incluye top 3 unread con link", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.includes("1. [critical] Rebalance plan"));
  assert.ok(txt.includes("/intel/37"));
});

test("formatDigest: 0 unread imprime mensaje vacío", () => {
  const txt = formatDigest(
    sampleContext({ topUnread: [] }),
    new Date("2026-04-19T19:00:00Z"),
  );
  assert.ok(txt.includes("Sin pendientes por leer"));
});

test("formatDigest: DCA línea coherente", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.includes("💸 DCA"));
  assert.ok(txt.includes("70€"));
  assert.ok(txt.includes("220€"));
  assert.ok(txt.includes("150€"));
});

test("formatDigest: length razonable para Telegram (<4096)", () => {
  const txt = formatDigest(sampleContext(), new Date("2026-04-19T19:00:00Z"));
  assert.ok(txt.length > 200, "digest sustantivo");
  assert.ok(txt.length < 4096, "cabe en un mensaje Telegram");
});
