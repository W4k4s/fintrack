import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransactions } from "@/lib/db/schema";
import { and, gte, lte, eq, sql, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const type = url.searchParams.get("type");
  const category = url.searchParams.get("category");

  const conditions = [];
  if (from) conditions.push(gte(bankTransactions.date, from));
  if (to) conditions.push(lte(bankTransactions.date, to));
  if (type) conditions.push(eq(bankTransactions.type, type));
  if (category) conditions.push(eq(bankTransactions.category, category));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const txs = await db.select().from(bankTransactions).where(where).orderBy(desc(bankTransactions.date));

  // Summary stats
  let totalIncome = 0;
  let totalExpenses = 0;
  const byType: Record<string, { income: number; expenses: number; count: number }> = {};
  const byMonth: Record<string, { income: number; expenses: number }> = {};

  for (const tx of txs) {
    const income = tx.credit || 0;
    const expense = tx.debit || 0;
    totalIncome += income;
    totalExpenses += expense;

    if (!byType[tx.type]) byType[tx.type] = { income: 0, expenses: 0, count: 0 };
    byType[tx.type].income += income;
    byType[tx.type].expenses += expense;
    byType[tx.type].count += 1;

    const month = tx.date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { income: 0, expenses: 0 };
    byMonth[month].income += income;
    byMonth[month].expenses += expense;
  }

  return NextResponse.json({
    transactions: txs,
    summary: {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0,
      byType,
      byMonth,
      count: txs.length,
    },
  });
}
