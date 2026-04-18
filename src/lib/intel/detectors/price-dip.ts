import { db, schema } from "@/lib/db";
import { dedupKey, dayWindowKey } from "../dedup";
import type { Detector, DetectorContext, DetectorSignal, Severity } from "../types";

const CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  PEPE: "pepe", BNB: "binancecoin", SHIB: "shiba-inu",
};

const ETF_TICKERS: Record<string, string> = {
  "MSCI World": "IWDA.AS",
  "MSCI Momentum": "IWMO.AS",
  "Gold ETC": "4GLD.DE",
  "EU Infl Bond": "IBCI.DE",
  MSFT: "MSFT",
  SAN: "SAN.MC",
};

async function getCryptoPrices(id: string): Promise<number[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=eur&days=7`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.prices || []).map((p: number[]) => p[1]);
  } catch {
    return [];
  }
}

async function getEtfSeries(ticker: string): Promise<number[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=7d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(
      (v: number | null): v is number => typeof v === "number",
    );
  } catch {
    return [];
  }
}

function severityFor(changePct: number, isCrypto: boolean): Severity | null {
  if (isCrypto) {
    if (changePct <= -10) return "high";
    if (changePct <= -5) return "med";
    if (changePct <= -3) return "low";
  } else {
    if (changePct <= -5) return "high";
    if (changePct <= -3) return "med";
    if (changePct <= -2) return "low";
  }
  return null;
}

export const priceDipDetector: Detector = {
  scope: "price_dip",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const plans = await db.select().from(schema.investmentPlans);
    const active = plans.filter((p) => p.enabled);
    const signals: DetectorSignal[] = [];
    const windowKey = dayWindowKey(ctx.now);

    for (const plan of active) {
      const isCrypto = Boolean(CRYPTO_IDS[plan.asset]);
      const series = isCrypto
        ? await getCryptoPrices(CRYPTO_IDS[plan.asset])
        : ETF_TICKERS[plan.asset]
        ? await getEtfSeries(ETF_TICKERS[plan.asset])
        : [];

      if (series.length < 5) continue;

      const current = series[series.length - 1];
      const avg = series.reduce((s, v) => s + v, 0) / series.length;
      const changePct = ((current - avg) / avg) * 100;
      const severity = severityFor(changePct, isCrypto);
      if (!severity) continue;

      signals.push({
        dedupKey: dedupKey("price_dip", plan.asset, windowKey),
        scope: "price_dip",
        asset: plan.asset,
        assetClass: plan.assetClass ?? (isCrypto ? "crypto" : null),
        severity,
        title: `${plan.asset} −${Math.abs(changePct).toFixed(1)}% vs media 7d`,
        summary: `${plan.asset} cotiza ${current.toFixed(
          isCrypto ? 2 : 2,
        )}€ (−${Math.abs(changePct).toFixed(1)}% vs media semanal ${avg.toFixed(2)}€).`,
        payload: {
          current,
          avg7d: avg,
          changePct: Math.round(changePct * 100) / 100,
          sampleSize: series.length,
          isCrypto,
        },
        suggestedAction: severity === "high" ? "buy_accelerate" : "review",
      });

      // gentle rate-limit for CoinGecko free tier
      if (isCrypto) await new Promise((r) => setTimeout(r, 300));
    }

    return signals;
  },
};
