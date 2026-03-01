import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getExchangeInfo } from "@/lib/exchanges/registry";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exchangeId = parseInt(id);

  const [exchange] = await db.select().from(schema.exchanges)
    .where(eq(schema.exchanges.id, exchangeId)).limit(1);
  if (!exchange) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const accounts = await db.select().from(schema.accounts)
    .where(eq(schema.accounts.exchangeId, exchangeId));

  const accountIds = accounts.map(a => a.id);
  const allAssets = await db.select().from(schema.assets);
  const assets = allAssets.filter(a => accountIds.includes(a.accountId));

  return NextResponse.json({
    exchange: {
      id: exchange.id,
      name: exchange.name,
      slug: exchange.slug,
      logo: getExchangeInfo(exchange.slug)?.logo || "",
      type: exchange.type,
      lastSync: exchange.lastSync,
    },
    assets: assets.map(a => ({
      id: a.id,
      symbol: a.symbol,
      amount: a.amount,
      currentPrice: a.currentPrice,
      lastUpdated: a.lastUpdated,
    })),
  });
}
