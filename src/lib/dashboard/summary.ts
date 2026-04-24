import { db, schema } from "@/lib/db";
import { getExchangeInfo } from "@/lib/exchanges/registry";

export interface DashboardPortfolioAsset {
  symbol: string;
  amount: number;
  value: number;
  price: number | null;
}

export interface DashboardSummary {
  portfolio: number;
  banking: number;
  netWorth: number;
  portfolioAssets: DashboardPortfolioAsset[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const assets = await db.select().from(schema.assets);
  const accounts = await db.select().from(schema.accounts);
  const exchanges = await db.select().from(schema.exchanges);

  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const exchangeMap = new Map(exchanges.map(e => [e.id, e]));

  let portfolioValue = 0;
  let bankingValue = 0;

  const portfolioBySymbol = new Map<string, DashboardPortfolioAsset>();

  for (const asset of assets) {
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    const info = exchange ? getExchangeInfo(exchange.slug) : null;
    const value = asset.amount * (asset.currentPrice || 0);

    if (info?.category === "bank") {
      bankingValue += value;
    } else {
      portfolioValue += value;

      const existing = portfolioBySymbol.get(asset.symbol);
      if (existing) {
        existing.amount += asset.amount;
        existing.value += value;
        if (asset.currentPrice) existing.price = asset.currentPrice;
      } else {
        portfolioBySymbol.set(asset.symbol, {
          symbol: asset.symbol,
          amount: asset.amount,
          value,
          price: asset.currentPrice,
        });
      }
    }
  }

  const portfolioAssets = Array.from(portfolioBySymbol.values()).sort((a, b) => b.value - a.value);

  return {
    portfolio: portfolioValue,
    banking: bankingValue,
    netWorth: portfolioValue + bankingValue,
    portfolioAssets,
  };
}
