import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { COINGECKO_IDS } from "@/lib/isin-map";

/**
 * Yahoo Finance ticker mapping for stocks/ETFs.
 * Prices come in their local currency — we convert to USD.
 */
const YAHOO_TICKERS: Record<string, { ticker: string; currency: "USD" | "EUR" | "GBP" }> = {
  "MSFT": { ticker: "MSFT", currency: "USD" },
  "NVDA": { ticker: "NVDA", currency: "USD" },
  "SAN": { ticker: "SAN.MC", currency: "EUR" },
  "MSCI World": { ticker: "IWDA.AS", currency: "EUR" },
  "EU Infl Bond": { ticker: "IBCI.AS", currency: "EUR" },
  "Gold ETC": { ticker: "SGLD.L", currency: "GBP" },
  "MSCI Momentum": { ticker: "IWMO.L", currency: "GBP" },
};

let lastRefresh = 0;
const MIN_INTERVAL = 60_000; // 1 minute minimum between refreshes

export async function POST() {
  // Rate limit
  if (Date.now() - lastRefresh < MIN_INTERVAL) {
    return NextResponse.json({ skipped: true, message: "Too soon, wait 1 minute" });
  }
  lastRefresh = Date.now();

  const assets = await db.select().from(schema.assets);
  const uniqueSymbols = [...new Set(assets.map(a => a.symbol))];

  const updates: { symbol: string; price: number }[] = [];

  // 1. Fetch crypto prices from CoinGecko (batch)
  const cryptoSymbols = uniqueSymbols.filter(s => COINGECKO_IDS[s]);
  if (cryptoSymbols.length > 0) {
    try {
      const ids = cryptoSymbols.map(s => COINGECKO_IDS[s]).join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        for (const symbol of cryptoSymbols) {
          const geckoId = COINGECKO_IDS[symbol];
          const price = data[geckoId]?.usd;
          if (price != null) {
            updates.push({ symbol, price });
          }
        }
      }
    } catch (e) {
      console.error("CoinGecko fetch error:", e);
    }
  }

  // 2. Fetch stock/ETF prices from Yahoo Finance
  // Get EUR and GBP to USD rates
  let eurToUsd = 1.18;
  let gbpToUsd = 1.27;
  try {
    const ratesRes = await fetch("https://api.exchangerate-api.com/v4/latest/USD", { cache: "no-store" });
    if (ratesRes.ok) {
      const rates = await ratesRes.json();
      eurToUsd = 1 / (rates.rates?.EUR || 0.85);
      gbpToUsd = 1 / (rates.rates?.GBP || 0.79);
    }
  } catch {}

  const stockSymbols = uniqueSymbols.filter(s => YAHOO_TICKERS[s]);
  for (const symbol of stockSymbols) {
    const { ticker, currency } = YAHOO_TICKERS[symbol];
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        const localPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (localPrice != null) {
          // Convert to USD
          let priceUsd = localPrice;
          if (currency === "EUR") priceUsd = localPrice * eurToUsd;
          else if (currency === "GBP") priceUsd = localPrice * gbpToUsd;
          updates.push({ symbol, price: priceUsd });
        }
      }
    } catch (e) {
      console.error(`Yahoo Finance error for ${symbol}:`, e);
    }
  }

  // 3. EUR cash — update with current EUR/USD rate
  if (uniqueSymbols.includes("EUR")) {
    updates.push({ symbol: "EUR", price: eurToUsd });
  }

  // 4. Apply updates to DB
  const now = new Date().toISOString();
  let updated = 0;
  for (const { symbol, price } of updates) {
    const matching = assets.filter(a => a.symbol === symbol);
    for (const asset of matching) {
      await db.update(schema.assets)
        .set({ currentPrice: price, lastUpdated: now })
        .where(eq(schema.assets.id, asset.id));
      updated++;
    }
  }

  revalidateTag("strategy", "default");
  return NextResponse.json({
    success: true,
    updated,
    prices: updates.reduce((acc, u) => ({ ...acc, [u.symbol]: u.price }), {}),
    timestamp: now,
  });
}

// GET returns last refresh info
export async function GET() {
  return NextResponse.json({ lastRefresh: lastRefresh ? new Date(lastRefresh).toISOString() : null });
}
