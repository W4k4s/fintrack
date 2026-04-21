import { test } from "node:test";
import assert from "node:assert/strict";

import { __internal } from "./claude-spawn.ts";
import type { schema } from "@/lib/db";

const { buildPrompt } = __internal;

type Signal = typeof schema.intelSignals.$inferSelect;

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 42,
    dedupKey: "abcd",
    scope: "opportunity",
    asset: "TTWO",
    assetClass: "stocks",
    severity: "high",
    title: "TTWO: 2 señales alineadas",
    summary: "TTWO (thematic_plays) — RSI<30, catalizador <30d.",
    payload: JSON.stringify({
      trackedId: 7,
      ticker: "TTWO",
      name: "Take-Two Interactive",
      subClass: "thematic_plays",
      status: "watching",
      hits: [
        { rule: "rsi_oversold", detail: { rsi14: 28.4, threshold: 30 } },
        { rule: "catalyst_near", detail: { event: "GTA6 launch", dateEstimate: "2026-05", daysUntil: 10 } },
      ],
      currentPrice: 142.5,
      priceSource: "yahoo",
      priceCurrency: "USD",
      entryPrice: 150,
      targetPrice: 190,
      stopPrice: 128,
      entryPlan: "DCA 4 tramos semanal mientras precio < 150",
      thesis: "GTA6 catalizador fuerte, pricing power Rockstar",
      timeHorizonMonths: 12,
      weekKey: "2026-W17",
    }),
    suggestedAction: "review",
    actionAmountEur: null,
    analysisStatus: "pending",
    analysisText: null,
    userStatus: "unread",
    snoozeUntil: null,
    createdAt: "2026-04-21T17:00:00Z",
    resolvedAt: null,
    ...overrides,
  } as Signal;
}

test("buildPrompt opportunity: incluye ticker, tesis y niveles", () => {
  const prompt = buildPrompt(mockSignal());
  assert.match(prompt, /CONTEXTO OPORTUNIDAD/);
  assert.match(prompt, /ticker: TTWO/);
  assert.match(prompt, /Take-Two Interactive/);
  assert.match(prompt, /sub-clase V2: thematic_plays/);
  assert.match(prompt, /entry 150/);
  assert.match(prompt, /target 190/);
  assert.match(prompt, /stop 128/);
  assert.match(prompt, /horizon 12m/);
  assert.match(prompt, /GTA6 catalizador/);
});

test("buildPrompt opportunity: lista cada hit con su detalle JSON", () => {
  const prompt = buildPrompt(mockSignal());
  assert.match(prompt, /reglas disparadas \(2\)/);
  assert.match(prompt, /rsi_oversold/);
  assert.match(prompt, /catalyst_near/);
  assert.match(prompt, /GTA6 launch/);
});

test("buildPrompt opportunity: instrucciones mencionan DCA y suggested_action", () => {
  const prompt = buildPrompt(mockSignal());
  assert.match(prompt, /Siempre DCA en tramos/);
  assert.match(prompt, /suggested_action OBLIGATORIO/);
  assert.match(prompt, /buy_accelerate|hold|review|ignore/);
});

test("buildPrompt opportunity: sin tesis escrita usa placeholder", () => {
  const prompt = buildPrompt(
    mockSignal({
      payload: JSON.stringify({
        ticker: "XLE",
        subClass: "thematic_plays",
        hits: [{ rule: "entry_window", detail: { deviationPct: -8 } }],
        currentPrice: 85.2,
        entryPrice: 92,
      }),
    }),
  );
  assert.match(prompt, /sin tesis escrita/);
  assert.match(prompt, /sin entry plan/);
  assert.match(prompt, /reglas disparadas \(1\)/);
});

test("buildPrompt news: no se mezcla con instrucciones opportunity", () => {
  const prompt = buildPrompt(
    mockSignal({
      scope: "news",
      payload: JSON.stringify({
        source: "coindesk",
        url: "https://example.com",
        bodyExcerpt: "BTC rallies",
        keywordsMatched: ["BTC"],
        assetsMentioned: ["BTC"],
      }),
    }),
  );
  assert.match(prompt, /CONTEXTO NOTICIA/);
  assert.doesNotMatch(prompt, /CONTEXTO OPORTUNIDAD/);
});

test("buildPrompt genérico (concentration_risk): sin bloque específico", () => {
  const prompt = buildPrompt(
    mockSignal({
      scope: "concentration_risk",
      payload: JSON.stringify({ topPosition: { symbol: "BTC" } }),
    }),
  );
  assert.doesNotMatch(prompt, /CONTEXTO NOTICIA/);
  assert.doesNotMatch(prompt, /CONTEXTO OPORTUNIDAD/);
  assert.doesNotMatch(prompt, /CONTEXTO TESIS ABIERTA/);
  assert.match(prompt, /FORMATO DE SALIDA/);
});

// ---------------------------------------------------------------------------
// thesis_* — Strategy V2 Fase 4
// ---------------------------------------------------------------------------

function thesisPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    trackedId: 11,
    ticker: "TTWO",
    name: "Take-Two Interactive",
    subClass: "thematic_plays",
    currentPrice: 85,
    priceSource: "yahoo",
    priceCurrency: "USD",
    entryPrice: 110,
    entryDate: "2026-01-15T00:00:00Z",
    targetPrice: 155,
    stopPrice: 92,
    timeHorizonMonths: 12,
    thesis: "GTA6 catalizador fuerte",
    entryPlan: "DCA 4 tramos semanal < 115",
    hit: { currentPrice: 85, stopPrice: 92, breachPct: -7.61 },
    windowKey: "2026-04-21",
    ...overrides,
  });
}

test("buildPrompt thesis_stop_hit: incluye tesis, niveles y SOFT stop reminder", () => {
  const prompt = buildPrompt(
    mockSignal({ scope: "thesis_stop_hit", severity: "critical", payload: thesisPayload() }),
  );
  assert.match(prompt, /CONTEXTO TESIS ABIERTA/);
  assert.match(prompt, /ticker: TTWO/);
  assert.match(prompt, /stop 92/);
  assert.match(prompt, /SOFT stop/i);
  assert.match(prompt, /suggested_action OBLIGATORIO: sell_partial/);
  // prohibición explícita de orden broker automática
  assert.match(prompt, /NUNCA propongas.*orden automática/i);
});

test("buildPrompt thesis_target_hit: menciona parcial profit y reescribir", () => {
  const prompt = buildPrompt(
    mockSignal({
      scope: "thesis_target_hit",
      severity: "high",
      payload: thesisPayload({ currentPrice: 160, hit: { currentPrice: 160, targetPrice: 155, overshootPct: 3.23 } }),
    }),
  );
  assert.match(prompt, /CONTEXTO TESIS ABIERTA/);
  assert.match(prompt, /parcial|reescribir/i);
  assert.match(prompt, /sell_partial.*hold.*review/);
});

test("buildPrompt thesis_near_stop: marca como EARLY WARNING sin cerrar", () => {
  const prompt = buildPrompt(
    mockSignal({
      scope: "thesis_near_stop",
      severity: "med",
      payload: thesisPayload({ currentPrice: 95, hit: { currentPrice: 95, stopPrice: 92, cushionPct: 3.26, thresholdPct: 5 } }),
    }),
  );
  assert.match(prompt, /EARLY WARNING/);
  assert.match(prompt, /suggested_action OBLIGATORIO: review \| hold/);
  assert.doesNotMatch(prompt, /sell_partial.*default/);
});

test("buildPrompt thesis_expired: pide decidir cerrar/reescribir/convertir", () => {
  const prompt = buildPrompt(
    mockSignal({
      scope: "thesis_expired",
      severity: "med",
      payload: thesisPayload({
        hit: { entryDate: "2026-01-15", timeHorizonMonths: 3, deadline: "2026-04-15", daysOverdue: 6 },
      }),
    }),
  );
  assert.match(prompt, /horizonte temporal/);
  assert.match(prompt, /cerrar.*reescribir|reescribir.*cerrar/i);
  // tolera paréntesis explicativos entre las opciones
  assert.match(prompt, /suggested_action OBLIGATORIO: review \| sell_partial/);
  assert.match(prompt, /\| ignore/);
});

test("buildPrompt thesis_*: nunca mezcla con bloque opportunity", () => {
  const prompt = buildPrompt(
    mockSignal({ scope: "thesis_stop_hit", severity: "critical", payload: thesisPayload() }),
  );
  assert.doesNotMatch(prompt, /CONTEXTO OPORTUNIDAD/);
});
