import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveScheduleItem, getMonthWeeks, getWeekBounds } from "./schedule.ts";
import { DEFAULT_POLICIES_V2 } from "./policies.ts";
import type { MultiplierContext } from "@/lib/intel/multipliers";
import type { InvestmentPlan } from "@/lib/db/schema";

// -- fixtures ---------------------------------------------------------------

function mkMctx(over: Partial<MultiplierContext> = {}): MultiplierContext {
  return {
    fg: 50,
    fundingByAsset: new Map(),
    vix: null,
    basisBtc: null,
    cryptoAllocationPct: 0,
    ...over,
  };
}

function mkPlan(over: Partial<InvestmentPlan> = {}): InvestmentPlan {
  return {
    id: 1,
    name: "BTC core",
    asset: "BTC",
    amount: 200,
    frequency: "monthly",
    nextExecution: null,
    enabled: true,
    assetClass: "crypto",
    autoExecute: false,
    autoDayOfWeek: null,
    autoStartDate: null,
    broker: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...over,
  } as InvestmentPlan;
}

// Middle of week 3 of April 2026 (Thursday 2026-04-16, a working day)
const NOW = new Date(2026, 3, 16, 12, 0, 0);

// -- helpers ---------------------------------------------------------------
// getWeekBounds opera con métodos locales (get/setDate), así que los tests
// comparan con getFullYear/getMonth/getDate para no romperse según TZ del CI.

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test("getWeekBounds monday→sunday de una fecha cualquiera", () => {
  const { monday, sunday } = getWeekBounds(new Date(2026, 3, 16)); // jueves
  assert.equal(ymdLocal(monday), "2026-04-13");
  assert.equal(ymdLocal(sunday), "2026-04-19");
});

test("getWeekBounds domingo pertenece a la semana previa", () => {
  const { monday } = getWeekBounds(new Date(2026, 3, 19)); // domingo
  assert.equal(ymdLocal(monday), "2026-04-13");
});

test("getMonthWeeks devuelve al menos 4 semanas", () => {
  const ws = getMonthWeeks(2026, 3);
  assert.ok(ws.length >= 4);
  assert.ok(ws.length <= 5);
});

// -- derivaciones ----------------------------------------------------------

test("displayAmount = weeklyTarget si no hay autoPending", () => {
  const item = deriveScheduleItem(mkPlan(), [], {
    mctx: mkMctx(),
    policies: DEFAULT_POLICIES_V2,
    now: NOW, emergencyFundOk: true,
  });
  assert.equal(item.autoPending, false);
  assert.equal(item.displayAmount, item.weeklyTarget);
});

test("emergencyFundOk=false → pauseReason=emergency_fund_incomplete (prioridad sobre crypto)", () => {
  const item = deriveScheduleItem(mkPlan({ asset: "BTC", assetClass: "crypto" }), [], {
    mctx: mkMctx({ cryptoAllocationPct: 25 }), // normalmente crypto_paused
    policies: DEFAULT_POLICIES_V2,
    now: NOW, emergencyFundOk: false,
  });
  assert.equal(item.pauseReason, "emergency_fund_incomplete");
  assert.equal(item.actionLabel, "Pausado (fondo emergencia)");
});

test("emergencyFundOk=false pausa ETFs también (survival first)", () => {
  const item = deriveScheduleItem(
    mkPlan({ asset: "MSCI World", assetClass: "etfs", amount: 405 }),
    [],
    { mctx: mkMctx(), policies: DEFAULT_POLICIES_V2, now: NOW, emergencyFundOk: false },
  );
  assert.equal(item.pauseReason, "emergency_fund_incomplete");
});

test("autoPending cuando autoStartDate es futuro → displayAmount = monthRemaining", () => {
  const item = deriveScheduleItem(
    mkPlan({
      autoExecute: true,
      autoDayOfWeek: 1,
      autoStartDate: "2026-05-01", // futuro respecto a NOW
    }),
    [],
    { mctx: mkMctx(), policies: DEFAULT_POLICIES_V2, now: NOW, emergencyFundOk: true },
  );
  assert.equal(item.autoPending, true);
  assert.equal(item.displayAmount, item.monthRemaining);
  assert.equal(item.done, item.monthRemaining === 0);
});

test("autoStartDate pasado → NO autoPending (ya arrancó el plan)", () => {
  const item = deriveScheduleItem(
    mkPlan({
      autoExecute: true,
      autoDayOfWeek: 1,
      autoStartDate: "2026-01-01",
    }),
    [],
    { mctx: mkMctx(), policies: DEFAULT_POLICIES_V2, now: NOW, emergencyFundOk: true },
  );
  assert.equal(item.autoPending, false);
});

test("executedRatio ≥99% colapsa remaining a 0 (residuos TR)", () => {
  const plan = mkPlan({ amount: 100 });
  const execs = [{ planId: plan.id, date: "2026-04-02", amount: 99.5 }];
  const item = deriveScheduleItem(plan, execs, {
    mctx: mkMctx(),
    policies: DEFAULT_POLICIES_V2,
    now: NOW, emergencyFundOk: true,
  });
  assert.equal(item.remaining, 0);
  assert.equal(item.monthRemaining, 0);
});

test("pauseReason=crypto_paused cuando allocation ≥ requiresCryptoUnderPct", () => {
  const item = deriveScheduleItem(mkPlan({ asset: "BTC", assetClass: "crypto" }), [], {
    mctx: mkMctx({ cryptoAllocationPct: 25 }),
    policies: DEFAULT_POLICIES_V2,
    now: NOW, emergencyFundOk: true,
  });
  assert.equal(item.pauseReason, "crypto_paused");
  assert.equal(item.actionLabel, "Pausado (policy crypto)");
});

test("pauseReason=asset_not_in_scope cuando crypto allocation ok pero asset no en scope", () => {
  // allocation 16% < 17%, pero SOL no está en appliesTo=["BTC"]
  const item = deriveScheduleItem(mkPlan({ asset: "SOL", assetClass: "crypto" }), [], {
    mctx: mkMctx({ cryptoAllocationPct: 16 }),
    policies: {
      ...DEFAULT_POLICIES_V2,
      multiplier: {
        ...DEFAULT_POLICIES_V2.multiplier,
        fgThreshold: 24,
        appliesTo: ["BTC"],
      },
    },
    now: NOW, emergencyFundOk: true,
  });
  assert.equal(item.pauseReason, "asset_not_in_scope");
  assert.equal(item.actionLabel, "Fuera de scope");
});

test("actionLabel 'Hecho' cuando monthRemaining=0 y autoPending", () => {
  const plan = mkPlan({
    amount: 100,
    autoExecute: true,
    autoDayOfWeek: 1,
    autoStartDate: "2026-05-10",
  });
  const execs = [{ planId: plan.id, date: "2026-04-05", amount: 100 }];
  const item = deriveScheduleItem(plan, execs, {
    mctx: mkMctx(),
    policies: DEFAULT_POLICIES_V2,
    now: NOW, emergencyFundOk: true,
  });
  assert.equal(item.autoPending, true);
  assert.equal(item.monthRemaining, 0);
  assert.equal(item.done, true);
  assert.equal(item.actionLabel, "Hecho");
});

test("actionLabel 'Ejecutar ahora' cuando autoPending y no done", () => {
  const item = deriveScheduleItem(
    mkPlan({
      autoExecute: true,
      autoDayOfWeek: 1,
      autoStartDate: "2026-05-10",
      amount: 100,
    }),
    [],
    { mctx: mkMctx(), policies: DEFAULT_POLICIES_V2, now: NOW, emergencyFundOk: true },
  );
  assert.equal(item.autoPending, true);
  assert.ok(item.actionLabel.startsWith("Ejecutar ahora €"));
});
