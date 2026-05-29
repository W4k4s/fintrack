import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  parseCsvRows,
  parseExchangeTransactions,
  dedupeAgainstExisting,
  type CsvTransaction,
} from "@/lib/csv-parsers";
import { parseXlsxRows, isXlsxBuffer } from "@/lib/xlsx-rows";
import { tryRecomputeAvgBuyPrice } from "@/lib/assets/cost-basis";
import { getEurPerUsd } from "@/lib/currency-rates";
import {
  toEurAmount,
  tryAutoMatchOrdersBatch,
  type MatchableTransaction,
} from "@/lib/intel/rebalance/order-matcher";
import { notifyAutoMatched } from "@/lib/intel/rebalance/auto-match-notifier";

type TxType = CsvTransaction["type"];

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
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Read the file into rows. Detect xlsx by magic bytes (then extension as a
    // fallback) — the route accepts both .xlsx and .csv exports.
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    const looksXlsx = isXlsxBuffer(buf) || /\.xlsx?$/i.test(file.name);

    let rows: string[][];
    if (looksXlsx) {
      rows = parseXlsxRows(buf);
    } else {
      const text = buf.toString("utf-8");
      if (!text.trim()) {
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }
      rows = parseCsvRows(text);
    }
    if (rows.length < 2) {
      return NextResponse.json({
        error: `No data rows found in ${file.name}. Check that the file is a valid export from ${exchange.name}.`,
      }, { status: 400 });
    }

    // Parse into normalized transactions (fail-loud on unknown layout).
    let parsed: CsvTransaction[];
    try {
      parsed = parseExchangeTransactions(rows, exchange.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (parsed.length === 0) {
      return NextResponse.json({
        error: "No transactions found. Check that the file format matches the expected export from " + exchange.name,
      }, { status: 400 });
    }

    // Multiset dedup against existing rows for this account.
    const existingTxs = await db.select().from(schema.transactions)
      .where(eq(schema.transactions.accountId, account.id));
    const { toInsert, skipped } = dedupeAgainstExisting(
      parsed,
      existingTxs.map(t => ({
        date: t.date,
        symbol: t.symbol,
        amount: t.amount,
        price: t.price,
        type: t.type,
      })),
    );

    const insertedByType: Record<TxType, number> = { buy: 0, sell: 0, deposit: 0, withdrawal: 0 };
    const recomputeSymbols = new Set<string>();
    const insertedTrades: Array<{
      symbol: string;
      type: "buy" | "sell";
      date: string;
      total: number;
      quoteCurrency: string;
    }> = [];

    for (const tx of toInsert) {
      await db.insert(schema.transactions).values({
        accountId: account.id,
        type: tx.type,
        symbol: tx.symbol,
        amount: tx.amount,
        price: tx.price,
        total: tx.total,
        quoteCurrency: tx.quoteCurrency,
        date: tx.date,
        notes: tx.notes
          ? `${tx.notes} on ${exchange.name} [import]`
          : `${tx.pair} on ${exchange.name} (fee: ${tx.fee} ${tx.feeCurrency}) [import]`,
      });
      insertedByType[tx.type]++;
      if (tx.type === "buy" || tx.type === "sell") {
        recomputeSymbols.add(tx.symbol);
        insertedTrades.push({
          symbol: tx.symbol,
          type: tx.type,
          date: tx.date,
          total: tx.total ?? 0,
          quoteCurrency: tx.quoteCurrency,
        });
      }
    }

    // Cost basis only reads buy/sell, so only those symbols need a recompute.
    for (const sym of recomputeSymbols) await tryRecomputeAvgBuyPrice(sym);

    // Fase 8.8 — auto-match rebalance orders from imported buy/sell trades only.
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

    const inserted = toInsert.length;
    return NextResponse.json({
      success: true,
      exchange: exchange.name,
      totalParsed: parsed.length,
      inserted,
      insertedByType,
      skipped,
      autoMatched,
      autoAmbiguous,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
