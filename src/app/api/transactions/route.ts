import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { tryRecomputeAvgBuyPrice } from "@/lib/assets/cost-basis";
import {
  toEurAmount,
  tryAutoMatchOrdersBatch,
  type MatchableTransaction,
} from "@/lib/intel/rebalance/order-matcher";
import { notifyAutoMatched } from "@/lib/intel/rebalance/auto-match-notifier";
import { getEurPerUsd } from "@/lib/currency-rates";

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

  if (tx && (tx.type === "buy" || tx.type === "sell") && tx.accountId) {
    try {
      const [acct] = await db
        .select({ exchangeId: schema.accounts.exchangeId })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, tx.accountId))
        .limit(1);
      if (acct?.exchangeId != null) {
        const [ex] = await db
          .select({ slug: schema.exchanges.slug })
          .from(schema.exchanges)
          .where(eq(schema.exchanges.id, acct.exchangeId))
          .limit(1);
        if (ex?.slug) {
          const eurPerUsd = await getEurPerUsd().catch(() => 0.92);
          const amountEur = toEurAmount(tx.total, tx.quoteCurrency, eurPerUsd);
          if (amountEur != null) {
            const matchable: MatchableTransaction = {
              symbol: tx.symbol,
              venue: ex.slug,
              type: tx.type,
              amountEur,
              date: tx.date,
            };
            const { matched, ambiguous } = await tryAutoMatchOrdersBatch([matchable]);
            await notifyAutoMatched(matched, ambiguous, "manual transaction");
          }
        }
      }
    } catch (err) {
      console.error("[transactions] auto-match failed", err);
    }
  }

  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).limit(1);
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  if (tx?.symbol) await tryRecomputeAvgBuyPrice(tx.symbol);
  return NextResponse.json({ ok: true });
}
