import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sma, rsi, ema, macd, bollingerPctB, annualizedVolatility, computeTechnicalSnapshot,
} from "./indicators";

describe("indicators — SMA", () => {
  it("returns null if not enough data", () => {
    assert.equal(sma([1, 2, 3], 5), null);
  });
  it("computes simple mean of last N", () => {
    assert.equal(sma([1, 2, 3, 4, 5], 3), 4); // mean(3,4,5)=4
  });
});

describe("indicators — RSI(14)", () => {
  it("returns null if fewer than period+1 samples", () => {
    assert.equal(rsi(Array.from({ length: 10 }, (_, i) => i + 1), 14), null);
  });
  it("returns 100 when all moves are gains (no losses)", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    assert.equal(rsi(prices, 14), 100);
  });
  it("sits in ~50 for oscillating flat series", () => {
    const prices: number[] = [];
    for (let i = 0; i < 40; i++) prices.push(100 + (i % 2 === 0 ? 1 : -1));
    const v = rsi(prices, 14);
    assert.ok(v != null && v > 40 && v < 60, `expected ~50, got ${v}`);
  });
});

describe("indicators — EMA", () => {
  it("returns null if not enough data", () => {
    assert.equal(ema([1, 2, 3], 5), null);
  });
  it("equals SMA when used on constant series", () => {
    const v = ema(Array(20).fill(50), 10);
    assert.ok(v != null && Math.abs(v - 50) < 1e-9);
  });
});

describe("indicators — MACD", () => {
  it("returns null if not enough data", () => {
    assert.equal(macd(Array.from({ length: 20 }, () => 100)), null);
  });
  it("produces near-zero values on constant series", () => {
    const prices = Array(60).fill(100);
    const m = macd(prices);
    assert.ok(m != null);
    assert.ok(Math.abs(m!.macd) < 1e-6);
    assert.ok(Math.abs(m!.signal) < 1e-6);
  });
  it("has positive hist on a sustained uptrend", () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + i);
    const m = macd(prices);
    assert.ok(m != null && m!.macd > 0);
  });
});

describe("indicators — Bollinger %B", () => {
  it("returns null if not enough data", () => {
    assert.equal(bollingerPctB([1, 2, 3]), null);
  });
  it("returns null on zero-variance series (sd=0)", () => {
    assert.equal(bollingerPctB(Array(25).fill(100)), null);
  });
  it("returns ~0.5 on gently rising series (price near mean)", () => {
    const prices = Array.from({ length: 25 }, (_, i) => 100 + i * 0.1);
    const v = bollingerPctB(prices);
    assert.ok(v != null && v > 0.6 && v < 1.0, `expected upper half, got ${v}`);
  });
});

describe("indicators — annualized volatility", () => {
  it("returns null on too-short series", () => {
    assert.equal(annualizedVolatility([1, 2, 3], 90), null);
  });
  it("returns ~0 on constant series", () => {
    const v = annualizedVolatility(Array(200).fill(100), 90);
    assert.ok(v != null && v < 1e-9);
  });
});

describe("indicators — snapshot", () => {
  it("fills all fields on a 300-bar synthetic series", () => {
    const prices = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 10) * 5);
    const snap = computeTechnicalSnapshot(prices);
    assert.ok(snap.price != null);
    assert.ok(snap.sma50 != null);
    assert.ok(snap.sma200 != null);
    assert.ok(snap.distToSma200Pct != null);
    assert.ok(snap.rsi14 != null);
    assert.ok(snap.macd != null);
    assert.ok(snap.vol90dPct != null);
  });
});
