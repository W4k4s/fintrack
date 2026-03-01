import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransactions, bankAccounts } from "@/lib/db/schema";
import { and, gte, lte, eq, desc } from "drizzle-orm";

// Detect if a transaction is an internal transfer between own accounts
function isInternalTransfer(
  tx: { type: string; description: string; source: string },
  ownIdentifiers: string[]
): boolean {
  const desc = tx.description.toLowerCase();
  const type = tx.type;

  // Savings roundups are always internal (ING feature)
  if (type === "savings") return true;

  // Traspasos between own ING accounts
  if (desc.includes("traspaso emitido cuenta nómina") || desc.includes("traspaso recibido cuenta nómina")
    || desc.includes("traspaso emitido cuenta nomina") || desc.includes("traspaso recibido cuenta nomina")) {
    return true;
  }

  // "Traspaso interno" — always between own ING sub-accounts
  if (desc.includes("traspaso interno")) return true;

  // Sell/buy trades from broker — portfolio movements, not real income/expense
  if (type === "trade" || desc.includes("sell trade") || desc.includes("buy trade")) return true;

  // "Venta Broker" / "Compra Broker" in savings account — investment movements
  if (desc.includes("venta broker") || desc.includes("compra broker")) return true;

  // Check if any own identifier appears in the description
  for (const id of ownIdentifiers) {
    if (desc.includes(id.toLowerCase())) return true;
  }

  return false;
}

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

  // Build own identifiers list from bank accounts + owner name
  const accounts = await db.select().from(bankAccounts);
  const ownIdentifiers: string[] = [
    "ISMAEL MORENO CUADRADO",  // Owner name
    "ISMAEL MORENO",
  ];

  // Add IBANs and account numbers
  for (const acc of accounts) {
    if (acc.accountNumber) {
      // Full number without spaces
      const clean = acc.accountNumber.replace(/\s/g, "");
      ownIdentifiers.push(clean);
      // Last 8 digits (common in TR descriptions)
      ownIdentifiers.push(clean.slice(-8));
      // IBAN format (ES + check digits + account)
      ownIdentifiers.push(`ES${clean.slice(-20)}`);
    }
  }

  // Summary stats
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalTransfersIn = 0;
  let totalTransfersOut = 0;
  const byType: Record<string, { income: number; expenses: number; count: number }> = {};
  const byMonth: Record<string, { income: number; expenses: number }> = {};
  const byCategory: Record<string, { income: number; expenses: number; count: number }> = {};

  // Annotate transactions with internal flag
  const annotatedTxs = txs.map(tx => {
    const internal = isInternalTransfer(tx, ownIdentifiers);
    return { ...tx, isInternal: internal };
  });

  for (const tx of annotatedTxs) {
    const income = tx.credit || 0;
    const expense = tx.debit || 0;

    if (tx.isInternal) {
      totalTransfersIn += income;
      totalTransfersOut += expense;
    } else {
      totalIncome += income;
      totalExpenses += expense;
    }

    // By type
    if (!byType[tx.type]) byType[tx.type] = { income: 0, expenses: 0, count: 0 };
    byType[tx.type].income += income;
    byType[tx.type].expenses += expense;
    byType[tx.type].count += 1;

    // By month (only real)
    if (!tx.isInternal) {
      const month = tx.date.substring(0, 7);
      if (!byMonth[month]) byMonth[month] = { income: 0, expenses: 0 };
      byMonth[month].income += income;
      byMonth[month].expenses += expense;
    }

    // By category (only real expenses)
    if (!tx.isInternal && expense > 0 && tx.category) {
      const cat = tx.category.split(" > ")[0];
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expenses: 0, count: 0 };
      byCategory[cat].expenses += expense;
      byCategory[cat].count += 1;
    }
  }

  return NextResponse.json({
    transactions: annotatedTxs,
    summary: {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0,
      totalTransfersIn,
      totalTransfersOut,
      byType,
      byMonth,
      byCategory,
      count: txs.length,
    },
  });
}
