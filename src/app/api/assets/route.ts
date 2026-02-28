import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET() {
  const assets = await db.query.assets.findMany({
    with: { account: { with: { exchange: true } } },
  });

  // Aggregate by symbol
  const aggregated = new Map<string, { symbol: string; total: number; value: number; accounts: string[] }>();
  for (const asset of assets) {
    const existing = aggregated.get(asset.symbol);
    const value = asset.amount * (asset.currentPrice || 0);
    if (existing) {
      existing.total += asset.amount;
      existing.value += value;
    } else {
      aggregated.set(asset.symbol, {
        symbol: asset.symbol,
        total: asset.amount,
        value,
        accounts: [],
      });
    }
  }

  return NextResponse.json({
    assets: Array.from(aggregated.values()).sort((a, b) => b.value - a.value),
    raw: assets,
  });
}
