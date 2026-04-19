import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { tryRecomputeAvgBuyPrice } from "@/lib/assets/cost-basis";

export async function GET() {
  const txs = await db.select({
    id: schema.transactions.id,
    type: schema.transactions.type,
    symbol: schema.transactions.symbol,
    amount: schema.transactions.amount,
    price: schema.transactions.price,
    total: schema.transactions.total,
    quoteCurrency: schema.transactions.quoteCurrency,
    date: schema.transactions.date,
    notes: schema.transactions.notes,
    accountId: schema.transactions.accountId,
    exchangeName: schema.exchanges.name,
    exchangeSlug: schema.exchanges.slug,
  })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .leftJoin(schema.exchanges, eq(schema.accounts.exchangeId, schema.exchanges.id))
    .orderBy(desc(schema.transactions.date))
    .limit(100);
  return NextResponse.json(txs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  body.total = body.amount * (body.price || 0);
  const [tx] = await db.insert(schema.transactions).values(body).returning();
  if (tx?.symbol) await tryRecomputeAvgBuyPrice(tx.symbol);
  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).limit(1);
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  if (tx?.symbol) await tryRecomputeAvgBuyPrice(tx.symbol);
  return NextResponse.json({ ok: true });
}
