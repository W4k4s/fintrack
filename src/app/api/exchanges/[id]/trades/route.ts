import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getAdapter } from "@/lib/exchanges";
import { tryRecomputeAvgBuyPrice } from "@/lib/assets/cost-basis";
import { getEurPerUsd } from "@/lib/currency-rates";
import {
  toEurAmount,
  tryAutoMatchOrdersBatch,
  type MatchableTransaction,
} from "@/lib/intel/rebalance/order-matcher";
import { notifyAutoMatched } from "@/lib/intel/rebalance/auto-match-notifier";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const exchangeId = parseInt(id);

    const [exchange] = await db.select().from(schema.exchanges)
      .where(eq(schema.exchanges.id, exchangeId)).limit(1);
    if (!exchange) return NextResponse.json({ error: "Exchange not found" }, { status: 404 });
    if (exchange.type === "manual") return NextResponse.json({ error: "Manual exchanges don't support trade sync" }, { status: 400 });

    const adapter = getAdapter(exchange);
    if (!adapter.fetchTrades) {
      return NextResponse.json({ error: "Trade history not supported for this exchange" }, { status: 400 });
    }

    // Get account
    const [account] = await db.select().from(schema.accounts)
      .where(eq(schema.accounts.exchangeId, exchangeId)).limit(1);
    if (!account) return NextResponse.json({ error: "No account found" }, { status: 404 });

    // Fetch existing transactions to avoid duplicates
    const existingTxs = await db.select().from(schema.transactions)
      .where(eq(schema.transactions.accountId, account.id));
    const existingIds = new Set(existingTxs.map(t => `${t.date}|${t.symbol}|${t.amount}|${t.price}`));

    // Fetch trades from exchange
    const trades = await adapter.fetchTrades();
    if (trades.length > 0) {
    }

    let inserted = 0;
    let skipped = 0;
    const insertedSymbols = new Set<string>();
    const insertedTrades: Array<{
      symbol: string;
      type: "buy" | "sell";
      date: string;
      total: number;
      quoteCurrency: string;
    }> = [];

    for (const trade of trades) {
      const key = `${trade.date.split("T")[0]}|${trade.symbol}|${trade.amount}|${trade.price}`;
      if (existingIds.has(key)) {
        skipped++;
        continue;
      }

      const quoteCurrency = trade.pair.includes("/")
        ? trade.pair.split("/")[1]
        : trade.feeCurrency || "USD";
      await db.insert(schema.transactions).values({
        accountId: account.id,
        type: trade.side,
        symbol: trade.symbol,
        amount: trade.amount,
        price: trade.price,
        total: trade.cost,
        quoteCurrency,
        date: trade.date.split("T")[0],
        notes: `${trade.pair} on ${exchange.name} (fee: ${trade.fee} ${trade.feeCurrency})`,
      });
      insertedSymbols.add(trade.symbol);
      insertedTrades.push({
        symbol: trade.symbol,
        type: trade.side,
        date: trade.date.split("T")[0],
        total: trade.cost,
        quoteCurrency,
      });
      inserted++;
    }

    for (const sym of insertedSymbols) await tryRecomputeAvgBuyPrice(sym);

    // Fase 8.8 — auto-match orders rebalance desde trades importados por API.
    let autoMatched = 0;
    let autoAmbiguous = 0;
    if (insertedTrades.length > 0) {
      try {
        const eurPerUsd = await getEurPerUsd();
        const matchable: MatchableTransaction[] = [];
        for (const t of insertedTrades) {
          const amountEur = toEurAmount(t.total, t.quoteCurrency, eurPerUsd);
          if (amountEur == null) continue;
          matchable.push({
            symbol: t.symbol,
            venue: exchange.slug,
            type: t.type,
            amountEur,
            date: t.date,
          });
        }
        if (matchable.length > 0) {
          const res = await tryAutoMatchOrdersBatch(matchable);
          autoMatched = res.matched.length;
          autoAmbiguous = res.ambiguous;
          await notifyAutoMatched(res.matched, res.ambiguous, `${exchange.name} trades`);
        }
      } catch (err) {
        console.error("[exchanges/trades] auto-match failed", err);
      }
    }

    return NextResponse.json({
      success: true,
      exchange: exchange.name,
      totalFetched: trades.length,
      inserted,
      skipped,
      autoMatched,
      autoAmbiguous,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: return existing trades for this exchange
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exchangeId = parseInt(id);

  const [account] = await db.select().from(schema.accounts)
    .where(eq(schema.accounts.exchangeId, exchangeId)).limit(1);
  if (!account) return NextResponse.json({ trades: [] });

  const trades = await db.select().from(schema.transactions)
    .where(eq(schema.transactions.accountId, account.id));

  return NextResponse.json({ trades: trades.sort((a, b) => b.date.localeCompare(a.date)) });
}
