/**
 * Correlación 90d del ticker investigado vs. top-N holdings del usuario.
 * Reutiliza `correlation.ts` (log-returns + pearson) y `fetcher.ts` (Yahoo/Gecko).
 */

import { db, schema } from "@/lib/db";
import { getEurPerUsd } from "@/lib/currency-rates";
import { getExchangeInfo } from "@/lib/exchanges/registry";
import { COINGECKO_IDS, YAHOO_TICKERS } from "@/lib/isin-map";
import { logReturns, pearson } from "@/lib/intel/correlation";
import { fetchPriceHistory, type PricePoint } from "./fetcher";

export interface HoldingCorr {
  symbol: string;
  weightPct: number;
  valueEur: number;
  corr90d: number | null;
  reason: string | null; // si corr null, qué falló
}

/**
 * Devuelve los top-N símbolos del portfolio de riesgo (excluye cash/bank)
 * ordenados por valor EUR descendente.
 */
async function topHoldings(limit = 5): Promise<Array<{ symbol: string; valueEur: number; pct: number }>> {
  const [assets, accounts, exchanges] = await Promise.all([
    db.select().from(schema.assets),
    db.select().from(schema.accounts),
    db.select().from(schema.exchanges),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const exchangeMap = new Map(exchanges.map((e) => [e.id, e]));
  const eurPerUsd = await getEurPerUsd();

  const byKey = new Map<string, number>();
  let total = 0;
  for (const asset of assets) {
    if (!asset.amount || asset.amount <= 0 || !asset.currentPrice) continue;
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    const info = exchange ? getExchangeInfo(exchange.slug) : null;
    if (info?.category === "bank") continue; // cash fuera
    const valueEur = asset.amount * asset.currentPrice * eurPerUsd;
    if (valueEur <= 0) continue;
    byKey.set(asset.symbol, (byKey.get(asset.symbol) ?? 0) + valueEur);
    total += valueEur;
  }

  const sorted = [...byKey.entries()]
    .map(([symbol, valueEur]) => ({ symbol, valueEur, pct: total > 0 ? (valueEur / total) * 100 : 0 }))
    .sort((a, b) => b.valueEur - a.valueEur)
    .slice(0, limit);
  return sorted;
}

/**
 * Traduce un símbolo del portfolio (ej. "MSCI World", "BTC") al ticker que
 * espera el fetcher. null si no mappea.
 */
function resolvePortfolioSymbol(symbol: string): string | null {
  if (COINGECKO_IDS[symbol]) return symbol; // fetcher detecta crypto por upper symbol
  if (YAHOO_TICKERS[symbol]) return YAHOO_TICKERS[symbol];
  // Fallback: probar el símbolo tal cual como Yahoo ticker (puede acertar o fallar).
  return symbol;
}

function alignByDate(a: PricePoint[], b: PricePoint[]): { ax: number[]; bx: number[] } {
  const byDayA = new Map<string, number>();
  for (const p of a) byDayA.set(new Date(p.ts * 1000).toISOString().slice(0, 10), p.close);
  const ax: number[] = [];
  const bx: number[] = [];
  for (const p of b) {
    const day = new Date(p.ts * 1000).toISOString().slice(0, 10);
    const ca = byDayA.get(day);
    if (ca != null) {
      ax.push(ca);
      bx.push(p.close);
    }
  }
  return { ax, bx };
}

export async function computeCorrelationVsTopHoldings(
  tickerPoints: PricePoint[],
  limit = 5,
): Promise<HoldingCorr[]> {
  const holdings = await topHoldings(limit);
  if (holdings.length === 0) return [];

  const results: HoldingCorr[] = [];
  for (const h of holdings) {
    const resolved = resolvePortfolioSymbol(h.symbol);
    if (!resolved) {
      results.push({ symbol: h.symbol, weightPct: h.pct, valueEur: h.valueEur, corr90d: null, reason: "no_ticker_map" });
      continue;
    }
    const hist = await fetchPriceHistory(resolved, 95);
    if (!hist.ok) {
      results.push({ symbol: h.symbol, weightPct: h.pct, valueEur: h.valueEur, corr90d: null, reason: hist.reason });
      continue;
    }
    const tail90 = (pts: PricePoint[]) => pts.slice(-91);
    const { ax, bx } = alignByDate(tail90(tickerPoints), tail90(hist.data.points));
    if (ax.length < 30) {
      results.push({
        symbol: h.symbol, weightPct: h.pct, valueEur: h.valueEur, corr90d: null,
        reason: `aligned_bars_too_few:${ax.length}`,
      });
      continue;
    }
    const corr = pearson(logReturns(ax), logReturns(bx));
    results.push({
      symbol: h.symbol, weightPct: h.pct, valueEur: h.valueEur,
      corr90d: corr, reason: corr == null ? "pearson_null" : null,
    });
  }
  return results;
}
