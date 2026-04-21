import { test } from "node:test";
import assert from "node:assert/strict";
import { expandFlatToSub, aggregateByParent, type SubTarget } from "./sub-targets.ts";
import type { StrategyProfile } from "@/lib/db/schema";

function profile(overrides: Partial<StrategyProfile> = {}): StrategyProfile {
  return {
    id: 1,
    name: "test",
    riskProfile: "balanced",
    targetCash: 15,
    targetEtfs: 30,
    targetCrypto: 25,
    targetGold: 10,
    targetBonds: 10,
    targetStocks: 10,
    monthlyInvest: 900,
    emergencyMonths: 3,
    active: true,
    notes: null,
    realizedYtdTraditionalOverrideEur: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as StrategyProfile;
}

const PARENTS = ["cash", "etfs", "crypto", "gold", "bonds", "stocks"] as const;
const FLAT_KEY = {
  cash: "targetCash",
  etfs: "targetEtfs",
  crypto: "targetCrypto",
  gold: "targetGold",
  bonds: "targetBonds",
  stocks: "targetStocks",
} as const;

function sumByParent(subs: SubTarget[]): Record<string, number> {
  const agg = aggregateByParent(subs);
  return Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}

test("expandFlatToSub preserva invariante sum(sub where parent=X) == target_X_flat (profile actual)", () => {
  const p = profile();
  const subs = expandFlatToSub(p);
  const byParent = sumByParent(subs);
  for (const parent of PARENTS) {
    const flat = Number(p[FLAT_KEY[parent]]);
    assert.ok(
      Math.abs(byParent[parent] - flat) <= 0.01,
      `parent=${parent}: sum(sub)=${byParent[parent]} vs flat=${flat}`,
    );
  }
});

test("expandFlatToSub preserva invariante con allocation extrema (crypto 50, cash 0)", () => {
  const p = profile({
    targetCash: 0,
    targetEtfs: 20,
    targetCrypto: 50,
    targetGold: 10,
    targetBonds: 10,
    targetStocks: 10,
  });
  const subs = expandFlatToSub(p);
  const byParent = sumByParent(subs);
  assert.equal(byParent.cash, 0, "cash=0 no genera sub-filas");
  assert.equal(byParent.crypto, 50, "crypto split suma exacto a 50");
  assert.equal(byParent.etfs, 20, "etfs split suma exacto a 20");
});

test("expandFlatToSub con profile 100% cash no falla y cuadra", () => {
  const p = profile({
    targetCash: 100,
    targetEtfs: 0,
    targetCrypto: 0,
    targetGold: 0,
    targetBonds: 0,
    targetStocks: 0,
  });
  const subs = expandFlatToSub(p);
  assert.equal(subs.length, 1, "solo cash_yield tiene target > 0");
  assert.equal(subs[0].subClass, "cash_yield");
  assert.equal(subs[0].targetPct, 100);
});

test("expandFlatToSub genera 9 sub-clases cuando todos los parent > 0", () => {
  const p = profile({ targetCash: 10, targetEtfs: 38, targetCrypto: 18, targetGold: 7, targetBonds: 10, targetStocks: 17 });
  const subs = expandFlatToSub(p);
  const classes = new Set(subs.map((s) => s.subClass));
  assert.equal(classes.size, 9, "9 sub-clases presentes");
  assert.ok(classes.has("cash_yield"));
  assert.ok(classes.has("etf_core"));
  assert.ok(classes.has("etf_factor"));
  assert.ok(classes.has("crypto_core"));
  assert.ok(classes.has("crypto_alt"));
  assert.ok(classes.has("legacy_hold"));
  assert.ok(classes.has("bonds_infl"));
  assert.ok(classes.has("gold"));
  assert.ok(classes.has("thematic_plays"));
});

test("aggregateByParent suma correctamente sub-targets explicit", () => {
  const subs: SubTarget[] = [
    { subClass: "cash_yield", parentClass: "cash", targetPct: 20 },
    { subClass: "etf_core", parentClass: "etfs", targetPct: 28 },
    { subClass: "etf_factor", parentClass: "etfs", targetPct: 10 },
    { subClass: "crypto_core", parentClass: "crypto", targetPct: 10 },
    { subClass: "crypto_alt", parentClass: "crypto", targetPct: 5 },
    { subClass: "legacy_hold", parentClass: "crypto", targetPct: 3 },
    { subClass: "bonds_infl", parentClass: "bonds", targetPct: 10 },
    { subClass: "gold", parentClass: "gold", targetPct: 7 },
    { subClass: "thematic_plays", parentClass: "stocks", targetPct: 7 },
  ];
  const agg = aggregateByParent(subs);
  assert.equal(agg.cash, 20);
  assert.equal(agg.etfs, 38);
  assert.equal(agg.crypto, 18);
  assert.equal(agg.bonds, 10);
  assert.equal(agg.gold, 7);
  assert.equal(agg.stocks, 7);
  assert.equal(Object.values(agg).reduce((a, b) => a + b, 0), 100);
});

test("expandFlatToSub: el residuo de redondeo se aplica a la sub-clase primaria (crypto 25)", () => {
  const p = profile({
    targetCash: 0, targetEtfs: 0, targetCrypto: 25, targetGold: 0, targetBonds: 0, targetStocks: 0,
  });
  const subs = expandFlatToSub(p);
  const cryptoSubs = subs.filter((s) => s.parentClass === "crypto");
  const sum = cryptoSubs.reduce((acc, s) => acc + s.targetPct, 0);
  assert.ok(Math.abs(sum - 25) <= 0.001, `sum crypto=${sum}, expected 25 exact`);
  const core = cryptoSubs.find((s) => s.subClass === "crypto_core");
  assert.ok(core && core.targetPct > 0, "crypto_core existe y absorbe residuo");
});
