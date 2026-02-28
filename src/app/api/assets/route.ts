import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const assets = await db.select().from(schema.assets);
  const accounts = await db.select().from(schema.accounts);
  const exchanges = await db.select({
    id: schema.exchanges.id,
    name: schema.exchanges.name,
    slug: schema.exchanges.slug,
  }).from(schema.exchanges);

  // Build lookup maps
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const exchangeMap = new Map(exchanges.map(e => [e.id, e]));

  // Aggregate by symbol with exchange sources
  const aggregated = new Map<string, { symbol: string; total: number; value: number; price: number | null; exchanges: { name: string; slug: string; amount: number }[] }>();

  for (const asset of assets) {
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    const value = asset.amount * (asset.currentPrice || 0);
    const existing = aggregated.get(asset.symbol);

    const source = exchange ? { name: exchange.name, slug: exchange.slug, amount: asset.amount } : { name: "Unknown", slug: "unknown", amount: asset.amount };

    if (existing) {
      existing.total += asset.amount;
      existing.value += value;
      if (asset.currentPrice) existing.price = asset.currentPrice;
      existing.exchanges.push(source);
    } else {
      aggregated.set(asset.symbol, {
        symbol: asset.symbol,
        total: asset.amount,
        value,
        price: asset.currentPrice,
        exchanges: [source],
      });
    }
  }

  return NextResponse.json({
    assets: Array.from(aggregated.values()).sort((a, b) => b.value - a.value),
    exchangeRegistry: exchanges,
  });
}
