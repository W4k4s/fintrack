import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDailyDigest, isWeekdayMadrid, type DailyDigestContext } from "./digest-daily.ts";

function baseCtx(): DailyDigestContext {
  return {
    btc24hPct: 1.2,
    eth24hPct: -0.5,
    vix: { level: 17.5, previousClose: 18, changePct: -2.7, asOf: Date.now() },
    fgNow: 50,
    fgPrev: 48,
    newSignalsLast12h: {
      total: 0,
      bySeverity: { low: 0, med: 0, high: 0, critical: 0 },
      topUnread: [],
    },
    ordersExpiringSoon: [],
  };
}

test("formatDailyDigest — contenido base con BTC/ETH y VIX", () => {
  const out = formatDailyDigest(baseCtx(), new Date("2026-04-20T06:30:00Z"));
  assert.match(out, /Briefing/);
  assert.match(out, /BTC.*\+1\.2%/);
  assert.match(out, /ETH.*-0\.5%/);
  assert.match(out, /VIX 17\.5/);
  assert.match(out, /F&G 50/);
});

test("formatDailyDigest — VIX ≥30 añade flag ⚠", () => {
  const ctx = baseCtx();
  ctx.vix = { level: 32, previousClose: 28, changePct: 14, asOf: Date.now() };
  const out = formatDailyDigest(ctx);
  assert.match(out, /VIX 32\.0.*⚠/);
});

test("formatDailyDigest — F&G miedo extremo", () => {
  const ctx = baseCtx();
  ctx.fgNow = 18;
  ctx.fgPrev = 22;
  const out = formatDailyDigest(ctx);
  assert.match(out, /F&G 18 \(-4\).*miedo extremo/);
});

test("formatDailyDigest — incluye top unread signals", () => {
  const ctx = baseCtx();
  ctx.newSignalsLast12h = {
    total: 3,
    bySeverity: { low: 1, med: 1, high: 1, critical: 0 },
    topUnread: [
      { id: 1, title: "BTC dip -5%", severity: "high", scope: "price_dip" },
      { id: 2, title: "Noticia random", severity: "med", scope: "news" },
    ],
  };
  const out = formatDailyDigest(ctx);
  assert.match(out, /3 señales nuevas.*12h/);
  assert.match(out, /BTC dip -5%/);
  assert.match(out, /Noticia random/);
});

test("formatDailyDigest — orders por expirar", () => {
  const ctx = baseCtx();
  ctx.ordersExpiringSoon = [
    { id: 1, type: "buy", assetSymbol: "BTC", venue: "binance", amountEur: 250, daysLeft: 1 },
    { id: 2, type: "sell", assetSymbol: "ETH", venue: "mexc", amountEur: 180, daysLeft: 2 },
  ];
  const out = formatDailyDigest(ctx);
  assert.match(out, /Orders por expirar/);
  assert.match(out, /buy BTC 250€.*binance.*1d/);
  assert.match(out, /sell ETH 180€.*mexc.*2d/);
});

test("formatDailyDigest — sin datos opcionales → mantiene estructura", () => {
  const ctx: DailyDigestContext = {
    btc24hPct: null,
    eth24hPct: null,
    vix: null,
    fgNow: null,
    fgPrev: null,
    newSignalsLast12h: { total: 0, bySeverity: { low: 0, med: 0, high: 0, critical: 0 }, topUnread: [] },
    ordersExpiringSoon: [],
  };
  const out = formatDailyDigest(ctx);
  assert.match(out, /Briefing/);
  assert.match(out, /BTC.*—/);
  assert.match(out, /VIX —/);
});

test("isWeekdayMadrid — jueves laborable → true", () => {
  const thu = new Date("2026-04-23T10:00:00Z"); // jueves
  assert.equal(isWeekdayMadrid(thu), true);
});

test("isWeekdayMadrid — sábado → false", () => {
  const sat = new Date("2026-04-25T10:00:00Z");
  assert.equal(isWeekdayMadrid(sat), false);
});

test("isWeekdayMadrid — domingo → false", () => {
  const sun = new Date("2026-04-26T10:00:00Z");
  assert.equal(isWeekdayMadrid(sun), false);
});
