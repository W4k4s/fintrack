import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, like, desc, sql } from "drizzle-orm";

// GET /api/bank-accounts?exchangeId=6
export async function GET(req: NextRequest) {
  const exchangeId = req.nextUrl.searchParams.get("exchangeId");
  if (!exchangeId) return NextResponse.json({ error: "exchangeId required" }, { status: 400 });

  const accounts = await db.select().from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.exchangeId, parseInt(exchangeId)));

  // Enrich with transaction stats
  const enriched = await Promise.all(accounts.map(async (acc) => {
    // Get latest balance
    const [latest] = await db.select({
      balance: schema.bankTransactions.balance,
      date: schema.bankTransactions.date,
    }).from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.source, acc.source))
      .orderBy(desc(schema.bankTransactions.date))
      .limit(1);

    // Get counts
    const [stats] = await db.select({
      count: sql<number>`COUNT(*)`,
      totalIn: sql<number>`COALESCE(SUM(credit), 0)`,
      totalOut: sql<number>`COALESCE(SUM(debit), 0)`,
      oldest: sql<string>`MIN(date)`,
    }).from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.source, acc.source));

    return {
      ...acc,
      balance: latest?.balance || 0,
      lastDate: latest?.date || null,
      transactionCount: stats?.count || 0,
      totalIn: stats?.totalIn || 0,
      totalOut: stats?.totalOut || 0,
      oldestDate: stats?.oldest || null,
    };
  }));

  return NextResponse.json(enriched);
}

// PATCH /api/bank-accounts — rename
export async function PATCH(req: NextRequest) {
  const { id, name } = await req.json();
  if (!id || !name) return NextResponse.json({ error: "id and name required" }, { status: 400 });

  await db.update(schema.bankAccounts)
    .set({ name })
    .where(eq(schema.bankAccounts.id, id));

  return NextResponse.json({ success: true });
}
