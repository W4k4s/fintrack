/**
 * Fetcher de datos de precio para Research Drawer (Strategy V2 Fase 0).
 * Normaliza Yahoo Finance (stocks/ETFs) y CoinGecko (crypto) en una shape común.
 * Errores devueltos como `{ ok: false, reason }` — nunca throw.
 */

import { COINGECKO_IDS } from "@/lib/isin-map";

export type PriceSource = "yahoo" | "coingecko" | "stooq" | "manual";
export type ResearchAssetClass = "equity" | "etf" | "crypto" | "bond" | "commodity";

export interface PricePoint {
  ts: number; // unix seconds
  close: number;
}

export interface PriceHistory {
  ticker: string;
  source: PriceSource;
  currency: string; // USD, EUR, GBP…
  points: PricePoint[];
  spot: number | null;
  fetchedAt: string; // ISO
}

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
    error?: { description?: string } | null;
  };
}

interface CoinGeckoChartResponse {
  prices?: Array<[number, number]>; // [ms, price]
}

const YAHOO_UA = "Mozilla/5.0";
const DEFAULT_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Clasifica un ticker entrante a source + asset_class.
 * Reglas:
 *  - crypto: símbolo en COINGECKO_IDS (BTC, ETH, …)
 *  - equity/etf: todo lo demás (Yahoo); distinción granular requiere lookup posterior.
 */
export function resolveTicker(raw: string): {
  normalized: string;
  source: PriceSource;
  assetClassHint: ResearchAssetClass;
  geckoId?: string;
} {
  const upper = raw.trim().toUpperCase();
  if (COINGECKO_IDS[upper]) {
    return {
      normalized: upper,
      source: "coingecko",
      assetClassHint: "crypto",
      geckoId: COINGECKO_IDS[upper],
    };
  }
  return {
    normalized: raw.trim(), // preserva sufijos como SAN.MC
    source: "yahoo",
    assetClassHint: "equity",
  };
}

/**
 * Precio + historia para un ticker Yahoo.
 * `range`: 5d | 1mo | 3mo | 6mo | 1y | 2y | 3y | 5y | max
 */
async function fetchYahoo(ticker: string, range: string): Promise<FetchResult<PriceHistory>> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": YAHOO_UA }, cache: "no-store" });
    if (!res.ok) return { ok: false, reason: `yahoo http ${res.status}` };
    const data = (await res.json()) as YahooChartResponse;
    const r = data.chart?.result?.[0];
    if (!r) {
      const msg = data.chart?.error?.description ?? "empty result";
      return { ok: false, reason: `yahoo: ${msg}` };
    }
    const ts = r.timestamp ?? [];
    const close = r.indicators?.quote?.[0]?.close ?? [];
    const points: PricePoint[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = close[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        points.push({ ts: ts[i], close: c });
      }
    }
    return {
      ok: true,
      data: {
        ticker,
        source: "yahoo",
        currency: r.meta?.currency ?? "USD",
        points,
        spot: r.meta?.regularMarketPrice ?? points[points.length - 1]?.close ?? null,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, reason: `yahoo exception: ${(e as Error).message}` };
  }
}

/**
 * Precio + historia para un ticker CoinGecko.
 * `days`: 1 | 7 | 30 | 90 | 365 | 730 | 1095 | max
 */
async function fetchCoinGecko(geckoId: string, days: number): Promise<FetchResult<PriceHistory>> {
  try {
    // NB: `interval=daily` ya requiere plan de pago (free tier → 401).
    // Dejando que CoinGecko auto-seleccione: days ≥ 91 devuelve diarios;
    // days ∈ [2, 90] devuelve horarios. Decimamos a 1 punto/día al normalizar.
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(geckoId)}/market_chart?vs_currency=eur&days=${days}`;
    const res = await fetchWithTimeout(url, { next: { revalidate: 900 } });
    if (!res.ok) return { ok: false, reason: `coingecko http ${res.status}` };
    const data = (await res.json()) as CoinGeckoChartResponse;
    const prices = data.prices ?? [];
    const byDay = new Map<string, [number, number]>();
    for (const p of prices) {
      if (!Number.isFinite(p[1])) continue;
      const dayKey = new Date(p[0]).toISOString().slice(0, 10);
      byDay.set(dayKey, p); // último punto del día gana
    }
    const points: PricePoint[] = Array.from(byDay.values())
      .sort((a, b) => a[0] - b[0])
      .map((p) => ({ ts: Math.floor(p[0] / 1000), close: p[1] }));
    const spot = points[points.length - 1]?.close ?? null;
    return {
      ok: true,
      data: {
        ticker: geckoId,
        source: "coingecko",
        currency: "EUR",
        points,
        spot,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, reason: `coingecko exception: ${(e as Error).message}` };
  }
}

/** Convierte días a range string aceptado por Yahoo. */
function daysToYahooRange(days: number): string {
  if (days <= 5) return "5d";
  if (days <= 31) return "1mo";
  if (days <= 93) return "3mo";
  if (days <= 186) return "6mo";
  if (days <= 400) return "1y";
  if (days <= 730) return "2y";
  if (days <= 1100) return "3y";
  if (days <= 1830) return "5y";
  return "max";
}

/**
 * API pública: obtiene historia normalizada.
 * `days` — ventana objetivo (se redondea al range superior en Yahoo).
 */
export async function fetchPriceHistory(rawTicker: string, days = 1100): Promise<FetchResult<PriceHistory>> {
  const resolved = resolveTicker(rawTicker);
  if (resolved.source === "coingecko" && resolved.geckoId) {
    return fetchCoinGecko(resolved.geckoId, days);
  }
  return fetchYahoo(resolved.normalized, daysToYahooRange(days));
}

/** Solo el spot (más barato que historia completa). */
export async function fetchSpotPrice(rawTicker: string): Promise<FetchResult<{ price: number; currency: string; source: PriceSource }>> {
  const resolved = resolveTicker(rawTicker);
  if (resolved.source === "coingecko" && resolved.geckoId) {
    const r = await fetchCoinGecko(resolved.geckoId, 1);
    if (!r.ok) return r;
    if (r.data.spot == null) return { ok: false, reason: "coingecko: no spot" };
    return { ok: true, data: { price: r.data.spot, currency: r.data.currency, source: "coingecko" } };
  }
  const r = await fetchYahoo(resolved.normalized, "5d");
  if (!r.ok) return r;
  if (r.data.spot == null) return { ok: false, reason: "yahoo: no spot" };
  return { ok: true, data: { price: r.data.spot, currency: r.data.currency, source: "yahoo" } };
}
