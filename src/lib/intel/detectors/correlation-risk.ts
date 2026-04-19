import { db, schema } from "@/lib/db";
import { getEurPerUsd } from "@/lib/currency-rates";
import { classifyAsset } from "../allocation/classify";
import { dedupKey, weekWindowKey } from "../dedup";
import {
  averageCorrelation,
  classifyCorrelation,
  CORRELATION_THRESHOLDS,
  logReturns,
  pairwiseCorrelations,
} from "../correlation";
import type { Detector, DetectorContext, DetectorSignal } from "../types";

/** Mínimo valor en EUR para incluir un asset en la matriz (evita polvo de shitcoins). */
const MIN_INCLUDE_EUR = 50;
/** Ventana de observación en días. */
const WINDOW_DAYS = 30;
/** Mínimo de símbolos crypto para que tenga sentido computar correlación. */
const MIN_SYMBOLS = 3;

const COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  PEPE: "pepe",
  BNB: "binancecoin",
  SHIB: "shiba-inu",
  XCH: "chia",
  ROSE: "oasis-network",
  MANA: "decentraland",
  S: "sonic-3",
  GPU: "gpunet",
};

async function fetchSeriesEur(id: string, days: number): Promise<number[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=eur&days=${days}&interval=daily`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const prices: number[][] = data?.prices ?? [];
    return prices.map((p) => p[1]).filter((x): x is number => Number.isFinite(x));
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const correlationRiskDetector: Detector = {
  scope: "correlation_risk",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const [assets, accounts] = await Promise.all([
      db.select().from(schema.assets),
      db.select().from(schema.accounts),
    ]);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const eurPerUsd = await getEurPerUsd();

    // Agrupar crypto por symbol, sumando valor cross-venue.
    const bySymbolEur = new Map<string, number>();
    for (const asset of assets) {
      if (!asset.amount || asset.amount <= 0) continue;
      if (!asset.currentPrice) continue;
      const account = accountMap.get(asset.accountId);
      if (!account) continue;
      if (classifyAsset(asset.symbol) !== "crypto") continue;
      const valueEur = asset.amount * asset.currentPrice * eurPerUsd;
      if (!(valueEur > 0)) continue;
      bySymbolEur.set(asset.symbol, (bySymbolEur.get(asset.symbol) ?? 0) + valueEur);
    }

    const eligible = [...bySymbolEur.entries()]
      .filter(([sym, v]) => v >= MIN_INCLUDE_EUR && COINGECKO_ID[sym])
      .map(([sym]) => sym);

    if (eligible.length < MIN_SYMBOLS) return [];

    // Rate limit CoinGecko free tier: 30 req/min. Intercalamos 1.5s entre calls
    // para no saturar cuando el detector coincide con otros tick concurrentes.
    // Si el primer fetch ya falla (0 prices), abortamos: probable 429 global.
    const seriesBySymbol: Record<string, number[]> = {};
    for (let i = 0; i < eligible.length; i++) {
      const sym = eligible[i];
      const id = COINGECKO_ID[sym];
      const prices = await fetchSeriesEur(id, WINDOW_DAYS);
      const returns = logReturns(prices);
      if (returns.length >= 10) {
        seriesBySymbol[sym] = returns;
      } else if (i === 0) {
        // Primera llamada sin datos → seguramente rate-limited. No insistimos.
        return [];
      }
      if (i < eligible.length - 1) await sleep(1500);
    }

    const symbolsWithSeries = Object.keys(seriesBySymbol);
    if (symbolsWithSeries.length < MIN_SYMBOLS) return [];

    const pairs = pairwiseCorrelations(seriesBySymbol);
    const avg = averageCorrelation(pairs);
    const severity = classifyCorrelation(avg);
    if (!severity || avg == null) return [];

    const topPairs = [...pairs].sort((a, b) => b.corr - a.corr).slice(0, 5);
    const weekKey = weekWindowKey(ctx.now);
    const signatureSymbols = symbolsWithSeries.sort().join(",");
    const dedup = dedupKey("correlation_risk", signatureSymbols, weekKey);

    const title = `Correlación crypto alta: ρ̄=${avg.toFixed(2)} (${symbolsWithSeries.length} activos)`;
    const summary = `Media pairwise ${avg.toFixed(2)} sobre ${pairs.length} pares (${WINDOW_DAYS}d). Top pair: ${topPairs[0].a}/${topPairs[0].b} ${topPairs[0].corr.toFixed(2)}. Diversificación real menor que la aparente: ${symbolsWithSeries.join(", ")} mueven en bloque.`;

    return [
      {
        dedupKey: dedup,
        scope: "correlation_risk",
        asset: null,
        assetClass: "crypto",
        severity,
        title,
        summary,
        payload: {
          windowDays: WINDOW_DAYS,
          symbols: symbolsWithSeries,
          averageCorrelation: Math.round(avg * 100) / 100,
          thresholds: CORRELATION_THRESHOLDS,
          pairs: pairs.map((p) => ({
            a: p.a,
            b: p.b,
            corr: Math.round(p.corr * 100) / 100,
          })),
          topPairs: topPairs.map((p) => ({
            a: p.a,
            b: p.b,
            corr: Math.round(p.corr * 100) / 100,
          })),
          valuesEur: Object.fromEntries(
            symbolsWithSeries.map((s) => [s, Math.round(bySymbolEur.get(s) ?? 0)]),
          ),
          weekKey,
        },
        suggestedAction: "review",
        actionAmountEur: null,
      },
    ];
  },
};
