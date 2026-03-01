import { NextRequest, NextResponse } from "next/server";
import { parseINGExcel, INGParseResult } from "@/lib/parsers/ing";
import { db, schema } from "@/lib/db";
import { eq, and, like, desc } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const action = formData.get("action") as string || "preview";

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const allResults: INGParseResult[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = parseINGExcel(buffer);
      allResults.push(result);
    }

    if (action === "preview") {
      return NextResponse.json({
        files: allResults.map(r => ({
          accountNumber: r.accountNumber,
          holder: r.holder,
          exportDate: r.exportDate,
          transactionCount: r.transactions.length,
          firstDate: r.transactions[r.transactions.length - 1]?.date,
          lastDate: r.transactions[0]?.date,
          currentBalance: r.transactions[0]?.balance || 0,
          sample: r.transactions.slice(0, 5),
        })),
      });
    }

    const [ingExchange] = await db.select().from(schema.exchanges).where(eq(schema.exchanges.slug, "ing"));
    if (!ingExchange) {
      return NextResponse.json({ error: "ING not found in exchanges. Add it first." }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;

    for (const result of allResults) {
      const lastFour = result.accountNumber.replace(/\s/g, "").slice(-4);
      const source = `ing-${lastFour}`;

      // Auto-create bank account if not exists
      const [existingBankAcc] = await db.select().from(schema.bankAccounts)
        .where(eq(schema.bankAccounts.source, source));

      if (!existingBankAcc) {
        await db.insert(schema.bankAccounts).values({
          exchangeId: ingExchange.id,
          source,
          accountNumber: result.accountNumber,
          name: `Account ...${lastFour}`,
        });
      }

      // Dedup
      const existing = await db.select().from(schema.bankTransactions).where(
        eq(schema.bankTransactions.source, source),
      );

      const existingSet = new Set(
        existing.map(e => {
          const amount = (e.credit || 0) - (e.debit || 0);
          return `${e.date}|${amount.toFixed(2)}|${(e.balance || 0).toFixed(2)}`;
        })
      );

      for (const tx of result.transactions) {
        const key = `${tx.date}|${tx.amount.toFixed(2)}|${tx.balance.toFixed(2)}`;
        if (existingSet.has(key)) { skipped++; continue; }
        existingSet.add(key);

        await db.insert(schema.bankTransactions).values({
          source,
          date: tx.date,
          type: tx.type,
          description: tx.description,
          credit: tx.amount > 0 ? tx.amount : null,
          debit: tx.amount < 0 ? Math.abs(tx.amount) : null,
          balance: tx.balance,
          currency: "EUR",
          category: tx.category ? `${tx.category}${tx.subcategory ? ` > ${tx.subcategory}` : ""}` : null,
        });
        imported++;
      }
    }

    // Recalculate total balance from ALL ING sources in DB
    const allSources = await db.selectDistinct({ source: schema.bankTransactions.source })
      .from(schema.bankTransactions)
      .where(like(schema.bankTransactions.source, "ing-%"));

    let totalBalance = 0;
    for (const { source } of allSources) {
      const [latest] = await db.select({ balance: schema.bankTransactions.balance })
        .from(schema.bankTransactions)
        .where(eq(schema.bankTransactions.source, source))
        .orderBy(desc(schema.bankTransactions.date))
        .limit(1);
      if (latest?.balance) totalBalance += latest.balance;
    }

    // Upsert EUR asset
    let [ingAccount] = await db.select().from(schema.accounts).where(
      eq(schema.accounts.exchangeId, ingExchange.id),
    );
    if (!ingAccount) {
      const [created] = await db.insert(schema.accounts).values({
        exchangeId: ingExchange.id, name: "Cash", type: "spot", currency: "EUR",
      }).returning();
      ingAccount = created;
    }

    const [eurAsset] = await db.select().from(schema.assets).where(
      and(eq(schema.assets.accountId, ingAccount.id), eq(schema.assets.symbol, "EUR"))
    );

    if (eurAsset) {
      await db.update(schema.assets)
        .set({ amount: totalBalance, lastUpdated: new Date().toISOString() })
        .where(eq(schema.assets.id, eurAsset.id));
    } else {
      await db.insert(schema.assets).values({
        accountId: ingAccount.id, symbol: "EUR", amount: totalBalance,
        currentPrice: 1, lastUpdated: new Date().toISOString(),
      });
    }

    await db.update(schema.exchanges)
      .set({ lastSync: new Date().toISOString() })
      .where(eq(schema.exchanges.id, ingExchange.id));

    return NextResponse.json({ imported, skipped, balance: totalBalance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
