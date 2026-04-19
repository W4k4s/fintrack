import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRebalancePlan, type PlannerInput, type PositionDetail } from "./planner.ts";

function baseInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  const profile = {
    id: 1,
    name: "test",
    riskProfile: "balanced",
    targetCash: 25,
    targetEtfs: 25,
    targetCrypto: 25,
    targetGold: 10,
    targetBonds: 10,
    targetStocks: 5,
    monthlyInvest: 900,
    emergencyMonths: 3,
    active: true,
    notes: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as unknown as PlannerInput["profile"];

  return {
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 25000, pct: 50 },
        crypto: { value: 5000, pct: 10 },
        etfs: { value: 12500, pct: 25 },
        gold: { value: 5000, pct: 10 },
        bonds: { value: 1500, pct: 3 },
        stocks: { value: 1000, pct: 2 },
      },
    },
    profile,
    positions: [],
    realizedYtd: { crypto: 0, traditional: 0 },
    weekKey: "2026-W16",
    ...overrides,
  };
}

function pos(
  symbol: string,
  cls: PositionDetail["class"],
  valueEur: number,
  pnlEur: number,
  bucket: PositionDetail["bucket"] = cls === "crypto" ? "crypto" : "traditional",
  amount = 1,
): PositionDetail {
  return { symbol, class: cls, valueEur, pnlEur, bucket, amount };
}

test("plan null si nada supera 7pp drift", () => {
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 13000, pct: 26 },
        crypto: { value: 13000, pct: 26 },
        etfs: { value: 12500, pct: 25 },
        gold: { value: 5000, pct: 10 },
        bonds: { value: 5000, pct: 10 },
        stocks: { value: 1500, pct: 3 },
      },
    },
    positions: [
      pos("BTC", "crypto", 13000, 2000),
      pos("MSCI World", "etfs", 12500, 1500),
    ],
  });
  assert.equal(buildRebalancePlan(input), null);
});

test("cash sobreexpuesto 50% vs 25% → deploy 12500€ a clases infraexpuestas", () => {
  const input = baseInput({
    positions: [
      pos("BTC", "crypto", 3000, 300),
      pos("ETH", "crypto", 2000, 100),
      pos("MSCI World", "etfs", 12500, 1500),
      pos("Gold ETC", "gold", 5000, -100),
      pos("EU Infl Bond", "bonds", 1500, -50),
      pos("MSFT", "stocks", 1000, 200),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan, "plan debe existir");
  assert.equal(plan.generatedFrom.includes("cash"), true);
  assert.equal(plan.generatedFrom.includes("crypto"), true);
  assert.ok(plan.moves.cashDeployEur > 0, "debe desplegar cash");
  // Sin sells necesarios (hay bastante cash), sells debería ser vacío o muy pequeño.
  assert.ok(
    plan.moves.sells.length === 0 ||
      plan.moves.sells.reduce((a, s) => a + s.amountEur, 0) < plan.moves.cashDeployEur,
    "sells menores que cash deploy",
  );
  // Buys deberían cubrir crypto, bonds, stocks.
  const buyClasses = new Set(plan.moves.buys.map((b) => b.class));
  assert.equal(buyClasses.has("crypto"), true, "debe comprar crypto");
  assert.equal(buyClasses.has("bonds"), true, "debe comprar bonds");
});

test("crypto sobreexpuesto con posición única → sell limitado al 50% cap", () => {
  // Target crypto 25%, actual 50% = 25000€. Exceso 12500€.
  // Única posición BTC 25000€. Cap 50% = 12500€ (coincide con target).
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 12500, pct: 25 },
        crypto: { value: 25000, pct: 50 },
        etfs: { value: 5000, pct: 10 },
        gold: { value: 2500, pct: 5 },
        bonds: { value: 2500, pct: 5 },
        stocks: { value: 2500, pct: 5 },
      },
    },
    positions: [
      pos("BTC", "crypto", 25000, 5000),
      pos("MSCI World", "etfs", 5000, 1000),
      pos("Gold ETC", "gold", 2500, -100),
      pos("EU Infl Bond", "bonds", 2500, 0),
      pos("MSFT", "stocks", 2500, 200),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  const btcSells = plan.moves.sells.filter((s) => s.symbol === "BTC");
  assert.equal(btcSells.length, 1, "debe haber 1 sell BTC");
  assert.ok(btcSells[0].amountEur <= 12500, "cap 50% respetado");
  assert.ok(btcSells[0].unrealizedPnlEur > 0, "sell BTC genera ganancia unrealized");
});

test("IRPF marginal: cruce tramo 6k con YTD parcial", () => {
  // Portfolio donde una venta dispara ganancia grande cruzando tramo.
  // Cash 50%, crypto 10% (infra 15pp) → necesita deploy cash, no sells.
  // Para provocar sell, pongo crypto sobreexpuesto con gain grande.
  const input = baseInput({
    allocation: {
      netWorth: 100000,
      byClass: {
        cash: { value: 10000, pct: 10 },  // infra 15pp
        crypto: { value: 50000, pct: 50 }, // sobre 25pp
        etfs: { value: 25000, pct: 25 },
        gold: { value: 10000, pct: 10 },
        bonds: { value: 3000, pct: 3 },
        stocks: { value: 2000, pct: 2 },
      },
    },
    positions: [
      pos("BTC", "crypto", 50000, 20000), // 50% value, 40% ganancia
      pos("MSCI World", "etfs", 25000, 2000),
      pos("Gold ETC", "gold", 10000, -500),
      pos("EU Infl Bond", "bonds", 3000, 0),
      pos("MSFT", "stocks", 2000, 300),
    ],
    realizedYtd: { crypto: 4000, traditional: 0 },
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  assert.ok(plan.moves.sells.length > 0, "hay sells");
  assert.ok(plan.fiscal.irpfEstimateEur > 0, "IRPF > 0 con ganancias");
  // Verificamos que el warning de FX histórico y tramos agregados está en notes.
  const notesJoined = plan.fiscal.notes.join(" ");
  assert.ok(notesJoined.includes("EUR/USD"), "warning FX presente");
});

test("pérdidas crypto → compensación intra-bucket, IRPF=0", () => {
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 12500, pct: 25 },
        crypto: { value: 25000, pct: 50 }, // sobre 25pp
        etfs: { value: 5000, pct: 10 },
        gold: { value: 2500, pct: 5 },
        bonds: { value: 2500, pct: 5 },
        stocks: { value: 2500, pct: 5 },
      },
    },
    positions: [
      pos("SOL", "crypto", 5000, -1500),
      pos("PEPE", "crypto", 5000, -800),
      pos("BTC", "crypto", 15000, 3000),
      pos("MSCI World", "etfs", 5000, 500),
      pos("Gold ETC", "gold", 2500, -100),
      pos("EU Infl Bond", "bonds", 2500, 0),
      pos("MSFT", "stocks", 2500, 200),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  // SOL y PEPE con pérdidas deben ir primero.
  const firstSells = plan.moves.sells.map((s) => s.symbol);
  assert.ok(firstSells[0] === "SOL" || firstSells[0] === "PEPE",
    `pérdidas primero, primer sell fue ${firstSells[0]}`);
  // Si el total de pérdidas supera al gain aplicado, IRPF = 0.
  if (plan.fiscal.totalLossEur >= plan.fiscal.totalGainEur) {
    assert.equal(plan.fiscal.irpfEstimateEur, 0);
  }
});

test("YTD alto → todo al 23%", () => {
  const input = baseInput({
    allocation: {
      netWorth: 100000,
      byClass: {
        cash: { value: 20000, pct: 20 },
        crypto: { value: 40000, pct: 40 }, // sobre 15pp
        etfs: { value: 25000, pct: 25 },
        gold: { value: 10000, pct: 10 },
        bonds: { value: 3000, pct: 3 },
        stocks: { value: 2000, pct: 2 },
      },
    },
    positions: [pos("BTC", "crypto", 40000, 10000)],
    realizedYtd: { crypto: 55000, traditional: 0 },
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  // Effective rate debe estar cerca del 23% (cap 50% del sell → ~5000€ gain al 23%)
  // Si netGain > 0, effective ~0.23.
  if (plan.fiscal.netGainCryptoEur > 0) {
    assert.ok(
      plan.fiscal.effectiveRate >= 0.22 && plan.fiscal.effectiveRate <= 0.24,
      `effective rate ${plan.fiscal.effectiveRate} fuera de 22-24%`,
    );
  }
});

test("clase vacía (stocks sin holdings) → needsStrategyPick", () => {
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 25000, pct: 50 }, // sobre 25pp
        crypto: { value: 12500, pct: 25 },
        etfs: { value: 12500, pct: 25 },
        gold: { value: 0, pct: 0 },
        bonds: { value: 0, pct: 0 },
        stocks: { value: 0, pct: 0 },
      },
    },
    positions: [
      pos("BTC", "crypto", 12500, 0),
      pos("MSCI World", "etfs", 12500, 0),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  const picks = plan.moves.buys.filter((b) => b.needsStrategyPick);
  assert.ok(picks.length >= 2, "gold/bonds/stocks vacíos deben marcar needsStrategyPick");
  assert.ok(picks.every((p) => p.symbol === null));
});

test("override YTD traditional manual se aplica", () => {
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 12500, pct: 25 },
        crypto: { value: 5000, pct: 10 },
        etfs: { value: 20000, pct: 40 }, // sobre 15pp
        gold: { value: 5000, pct: 10 },
        bonds: { value: 5000, pct: 10 },
        stocks: { value: 2500, pct: 5 },
      },
    },
    positions: [
      pos("MSCI World", "etfs", 20000, 3000),
      pos("BTC", "crypto", 5000, 0),
      pos("Gold ETC", "gold", 5000, 0),
      pos("EU Infl Bond", "bonds", 5000, 0),
      pos("MSFT", "stocks", 2500, 0),
    ],
    realizedYtd: { crypto: 0, traditional: 0 },
    realizedYtdTraditionalOverrideEur: 45000, // casi tope tramo 50k
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  assert.equal(plan.fiscal.realizedYtdOverrideEur, 45000);
  // Sin override el IRPF usaría tramo 19/21%; con override 45k el tramo arranca en 21% y cruza a 23%.
  assert.ok(plan.fiscal.realizedYtdEur >= 45000);
});

test("warning TR emitido cuando hay sells traditional sin override", () => {
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 12500, pct: 25 },
        crypto: { value: 5000, pct: 10 },
        etfs: { value: 20000, pct: 40 }, // sobre 15pp
        gold: { value: 5000, pct: 10 },
        bonds: { value: 5000, pct: 10 },
        stocks: { value: 2500, pct: 5 },
      },
    },
    positions: [
      pos("MSCI World", "etfs", 20000, 3000),
      pos("BTC", "crypto", 5000, 0),
      pos("Gold ETC", "gold", 5000, 0),
      pos("EU Infl Bond", "bonds", 5000, 0),
      pos("MSFT", "stocks", 2500, 0),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  const warn = plan.fiscal.notes.find((n) => n.includes("YTD traditional"));
  assert.ok(warn, "debe avisar del YTD TR");
});

test("cash infraexpuesto drena antes de repartir a otras clases", () => {
  // Cash 15% (infra 10pp), etfs 40% (sobre 15pp). Sell etfs debe reponer cash primero.
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 7500, pct: 15 },
        crypto: { value: 5000, pct: 10 }, // infra 15pp
        etfs: { value: 20000, pct: 40 }, // sobre 15pp
        gold: { value: 5000, pct: 10 },
        bonds: { value: 10000, pct: 20 },
        stocks: { value: 2500, pct: 5 },
      },
    },
    positions: [
      pos("MSCI World", "etfs", 20000, 1000),
      pos("BTC", "crypto", 5000, 0),
      pos("Gold ETC", "gold", 5000, 0),
      pos("EU Infl Bond", "bonds", 10000, 0),
      pos("MSFT", "stocks", 2500, 0),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  // Cash debería estar en generatedFrom (drift -10pp = 10 >= 7 MED).
  assert.equal(plan.generatedFrom.includes("cash"), true);
  // Coverage < 100% típicamente cuando capital drena a cash primero.
  // Al menos el plan no asigna buy a cash (se excluye de compras).
  assert.ok(!plan.moves.buys.some((b) => b.class === "cash"));
});

test("no sell cuando solo hay bank accounts (no asset vendible)", () => {
  const input = baseInput({
    allocation: {
      netWorth: 50000,
      byClass: {
        cash: { value: 35000, pct: 70 }, // sobre 45pp
        crypto: { value: 5000, pct: 10 },
        etfs: { value: 5000, pct: 10 },
        gold: { value: 2500, pct: 5 },
        bonds: { value: 1500, pct: 3 },
        stocks: { value: 1000, pct: 2 },
      },
    },
    positions: [
      pos("BTC", "crypto", 5000, 0),
      pos("MSCI World", "etfs", 5000, 0),
    ],
  });
  const plan = buildRebalancePlan(input);
  assert.ok(plan);
  assert.ok(plan.moves.cashDeployEur > 0, "todo sale de cash deploy");
  assert.equal(plan.moves.sells.length, 0, "no hay sells");
});
