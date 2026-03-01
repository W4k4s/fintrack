import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SYMBOL_ISINS, SYMBOL_NAMES, COINGECKO_IDS, YAHOO_TICKERS, getSymbolIdentifiers, transactionMatchesSymbol } from "@/lib/isin-map";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const decodedSymbol = decodeURIComponent(symbol);

  // Get all assets, accounts, exchanges
  const allAssets = await db.select().from(schema.assets);
  const accounts = await db.select().from(schema.accounts);
  const exchanges = await db.select().from(schema.exchanges);

  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const exchangeMap = new Map(exchanges.map(e => [e.id, e]));

  // Filter assets matching this symbol
  const matchingAssets = allAssets.filter(a => a.symbol === decodedSymbol);

  if (matchingAssets.length === 0) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Aggregate
  let totalAmount = 0;
  let totalValue = 0;
  let weightedCost = 0;
  let hasAvgPrice = false;
  const exchangeBreakdown: { name: string; slug: string; amount: number; value: number; price: number | null }[] = [];

  for (const asset of matchingAssets) {
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    const value = asset.amount * (asset.currentPrice || 0);

    totalAmount += asset.amount;
    totalValue += value;
    if (asset.avgBuyPrice) {
      weightedCost += asset.amount * asset.avgBuyPrice;
      hasAvgPrice = true;
    }

    exchangeBreakdown.push({
      name: exchange?.name || "Unknown",
      slug: exchange?.slug || "unknown",
      amount: asset.amount,
      value,
      price: asset.currentPrice,
    });
  }

  const currentPrice = matchingAssets[0]?.currentPrice || 0;
  const avgBuyPrice = hasAvgPrice ? weightedCost / totalAmount : null;
  const pl = avgBuyPrice ? totalValue - (totalAmount * avgBuyPrice) : null;
  const plPct = avgBuyPrice ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : null;

  // Get related bank transactions
  const allBankTxs = await db.select().from(schema.bankTransactions);
  const isCashAsset = ["EUR", "USD", "GBP", "CHF"].includes(decodedSymbol);
  const relatedTxs = isCashAsset
    ? allBankTxs
        .filter(tx => tx.currency === decodedSymbol || (decodedSymbol === "EUR" && !tx.currency))
        .sort((a, b) => b.date.localeCompare(a.date))
    : allBankTxs
        .filter(tx => tx.type === "trade" || tx.type === "dividend" || tx.type === "gift")
        .filter(tx => transactionMatchesSymbol(tx.description, decodedSymbol))
        .sort((a, b) => b.date.localeCompare(a.date));

  // Get exchange trades from transactions table
  const allExchangeTrades = await db.select().from(schema.transactions);
  const exchangeTrades = allExchangeTrades
    .filter(tx => tx.symbol === decodedSymbol)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Map exchange trades with exchange names
  const exchangeTradesWithNames = exchangeTrades.map(tx => {
    const account = accountMap.get(tx.accountId || 0);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    return {
      id: tx.id,
      date: tx.date,
      type: tx.type,  // buy or sell
      symbol: tx.symbol,
      amount: tx.amount,
      price: tx.price,
      total: tx.total,
      exchange: exchange?.name || "Unknown",
      notes: tx.notes,
      source: "exchange",
    };
  });

  // Price chart data (crypto only via CoinGecko)
  let priceHistory: { date: string; price: number }[] = [];
  const geckoId = COINGECKO_IDS[decodedSymbol];
  const yahooTicker = YAHOO_TICKERS[decodedSymbol];

  if (geckoId) {
    // Crypto: CoinGecko
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=30`,
        { next: { revalidate: 3600 } }
      );
      if (res.ok) {
        const data = await res.json();
        priceHistory = (data.prices || []).map(([ts, price]: [number, number]) => ({
          date: new Date(ts).toISOString().split("T")[0],
          price: Math.round(price * 100) / 100,
        }));
        const byDate = new Map<string, number>();
        for (const p of priceHistory) byDate.set(p.date, p.price);
        priceHistory = Array.from(byDate.entries()).map(([date, price]) => ({ date, price }));
      }
    } catch { /* CoinGecko rate limit or error */ }
  } else if (yahooTicker) {
    // Stocks/ETFs: Yahoo Finance
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1mo`,
        { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }
      );
      if (res.ok) {
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (result) {
          const timestamps: number[] = result.timestamp || [];
          const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
          priceHistory = timestamps
            .map((ts: number, i: number) => ({
              date: new Date(ts * 1000).toISOString().split("T")[0],
              price: closes[i] != null ? Math.round(closes[i]! * 100) / 100 : 0,
            }))
            .filter((p: { price: number }) => p.price > 0);
        }
      }
    } catch { /* Yahoo Finance error */ }
  }

  return NextResponse.json({
    symbol: decodedSymbol,
    name: SYMBOL_NAMES[decodedSymbol] || decodedSymbol,
    currentPrice,
    avgBuyPrice,
    totalAmount,
    totalValue,
    pl,
    plPct,
    exchangeBreakdown,
    identifiers: getSymbolIdentifiers(decodedSymbol),
    exchangeTrades: exchangeTradesWithNames,
    trades: relatedTxs.map(tx => ({
      id: tx.id,
      date: tx.date,
      type: tx.type,
      description: tx.description,
      credit: tx.credit,
      debit: tx.debit,
      balance: tx.balance,
      currency: tx.currency,
    })),
    priceHistory,
    isCrypto: !!geckoId,
    isStock: !!yahooTicker,
  });
}
