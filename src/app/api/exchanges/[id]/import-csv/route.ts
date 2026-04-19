import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { parseCsvTrades } from "@/lib/csv-parsers";
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

    // Get exchange
    const [exchange] = await db.select().from(schema.exchanges)
      .where(eq(schema.exchanges.id, exchangeId)).limit(1);
    if (!exchange) {
      return NextResponse.json({ error: "Exchange not found" }, { status: 404 });
    }

    // Get account
    const [account] = await db.select().from(schema.accounts)
      .where(eq(schema.accounts.exchangeId, exchangeId)).limit(1);
    if (!account) {
      return NextResponse.json({ error: "No account found for this exchange" }, { status: 404 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Parse CSV trades
    const trades = parseCsvTrades(csvText, exchange.slug);
    if (trades.length === 0) {
      return NextResponse.json({
        error: "No trades found in CSV. Check that the file format matches the expected export from " + exchange.name,
      }, { status: 400 });
    }

    // Get existing transactions for dedup
    const existingTxs = await db.select().from(schema.transactions)
      .where(eq(schema.transactions.accountId, account.id));
    const existingKeys = new Set(
      existingTxs.map(t => `${t.date}|${t.symbol}|${t.amount}|${t.price}`)
    );

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
      const key = `${trade.date}|${trade.symbol}|${trade.amount}|${trade.price}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      await db.insert(schema.transactions).values({
        accountId: account.id,
        type: trade.type,
        symbol: trade.symbol,
        amount: trade.amount,
        price: trade.price,
        total: trade.total,
        quoteCurrency: trade.quoteCurrency,
        date: trade.date,
        notes: `${trade.pair} on ${exchange.name} (fee: ${trade.fee} ${trade.feeCurrency}) [CSV import]`,
      });
      existingKeys.add(key);
      insertedSymbols.add(trade.symbol);
      insertedTrades.push({
        symbol: trade.symbol,
        type: trade.type,
        date: trade.date,
        total: trade.total,
        quoteCurrency: trade.quoteCurrency,
      });
      inserted++;
    }

    for (const sym of insertedSymbols) await tryRecomputeAvgBuyPrice(sym);

    // Fase 8.8 — auto-match orders rebalance desde trades importados por CSV.
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
          await notifyAutoMatched(res.matched, res.ambiguous, `${exchange.name} CSV import`);
        }
      } catch (err) {
        console.error("[exchanges/import-csv] auto-match failed", err);
      }
    }

    return NextResponse.json({
      success: true,
      exchange: exchange.name,
      totalParsed: trades.length,
      inserted,
      skipped,
      autoMatched,
      autoAmbiguous,
    });
  } catch (error: any) {
    console.error("CSV import error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
