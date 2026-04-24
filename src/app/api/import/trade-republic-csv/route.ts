import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseTradeRepublicCsv } from "@/lib/parsers/trade-republic-csv";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const parsed = [] as Awaited<ReturnType<typeof parseTradeRepublicCsv>>[];
    for (const file of files) {
      const text = await file.text();
      parsed.push(parseTradeRepublicCsv(text));
    }

    // Dedup preview: ¿cuántas transactions ya existen en DB (por external_id)?
    const allTxs = parsed.flatMap((p) => p.transactions);
    const externalIds = allTxs.map((t) => t.externalId).filter(Boolean);

    let existingSet = new Set<string>();
    if (externalIds.length > 0) {
      const existing = await db
        .select({ externalId: bankTransactions.externalId })
        .from(bankTransactions)
        .where(eq(bankTransactions.source, "trade-republic"));
      existingSet = new Set(
        existing.map((e) => e.externalId).filter((x): x is string => Boolean(x)),
      );
    }

    const duplicates = allTxs.filter((t) => existingSet.has(t.externalId)).length;
    const wouldInsert = allTxs.length - duplicates;

    // Merge si vienen varios CSVs. Securities/crypto: la última posición gana (es
    // la suma acumulada, así que el último CSV incluye todo lo del anterior).
    const last = parsed[parsed.length - 1];

    return NextResponse.json({
      securities: last.securities,
      crypto: last.crypto,
      cashBalance: last.cashBalance,
      totalIn: parsed.reduce((s, p) => s + p.totalIn, 0),
      totalOut: parsed.reduce((s, p) => s + p.totalOut, 0),
      transactions: allTxs,
      transactionCount: allTxs.length,
      trades: parsed.flatMap((p) => p.trades),
      dryRun: {
        duplicates,
        wouldInsert,
      },
      dateRange: last.dateRange,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
