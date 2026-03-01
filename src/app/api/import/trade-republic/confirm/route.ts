import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchanges, accounts, assets, bankTransactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { securities, crypto, cashBalance, transactions } = data;

    // Get EUR→USD rate
    const ratesRes = await fetch("http://localhost:3000/api/currency");
    const rates = await ratesRes.json();
    const eurToUsd = 1 / (rates.EUR || 0.92); // EUR rate is USD→EUR, we need inverse

    // Upsert Trade Republic exchange
    let [exchange] = await db.select().from(exchanges).where(eq(exchanges.slug, "trade-republic"));
    if (!exchange) {
      const [inserted] = await db.insert(exchanges).values({
        name: "Trade Republic",
        slug: "trade-republic",
        type: "manual",
        enabled: true,
      }).returning();
      exchange = inserted;
    }

    // Upsert accounts
    const accountTypes = [
      { name: "Securities", type: "spot" as const },
      { name: "Crypto", type: "spot" as const },
      { name: "Cash", type: "manual" as const },
    ];
    const acctMap: Record<string, number> = {};

    for (const at of accountTypes) {
      let [acct] = await db.select().from(accounts)
        .where(and(eq(accounts.exchangeId, exchange.id), eq(accounts.name, at.name)));
      if (!acct) {
        const [inserted] = await db.insert(accounts).values({
          exchangeId: exchange.id,
          name: at.name,
          type: at.type,
          currency: "EUR",
        }).returning();
        acct = inserted;
      }
      acctMap[at.name] = acct.id;
    }

    // Clear existing TR assets only for accounts that have new data
    if (securities?.length) {
      await db.delete(assets).where(eq(assets.accountId, acctMap.Securities));
    }
    if (crypto?.length) {
      await db.delete(assets).where(eq(assets.accountId, acctMap.Crypto));
    }
    if (cashBalance != null) {
      await db.delete(assets).where(eq(assets.accountId, acctMap.Cash));
    }

    // Insert securities
    if (securities?.length) {
      for (const s of securities) {
        await db.insert(assets).values({
          accountId: acctMap.Securities,
          symbol: s.symbol,
          amount: s.quantity,
          currentPrice: s.priceEur * eurToUsd,
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    // Insert crypto
    if (crypto?.length) {
      for (const c of crypto) {
        await db.insert(assets).values({
          accountId: acctMap.Crypto,
          symbol: c.symbol,
          amount: c.quantity,
          avgBuyPrice: c.costEur ? (c.costEur / c.quantity) * eurToUsd : undefined,
          currentPrice: c.priceEur * eurToUsd,
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    // Insert cash as EUR position
    if (cashBalance != null) {
      await db.insert(assets).values({
        accountId: acctMap.Cash,
        symbol: "EUR",
        amount: cashBalance,
        currentPrice: eurToUsd, // 1 EUR = X USD
        lastUpdated: new Date().toISOString(),
      });
    }

    // Merge bank transactions (skip duplicates by date + balance + description)
    let txInserted = 0;
    let txSkipped = 0;
    if (transactions?.length) {
      const existing = await db.select({
        date: bankTransactions.date,
        balance: bankTransactions.balance,
        description: bankTransactions.description,
      }).from(bankTransactions).where(eq(bankTransactions.source, "trade-republic"));

      const existingSet = new Set(
        existing.map(e => `${e.date}|${e.balance}|${e.description?.substring(0, 50)}`)
      );

      for (const tx of transactions) {
        const key = `${tx.date}|${tx.balance}|${tx.description?.substring(0, 50)}`;
        if (existingSet.has(key)) {
          txSkipped++;
          continue;
        }
        await db.insert(bankTransactions).values({
          source: "trade-republic",
          date: tx.date,
          type: tx.type,
          description: tx.description,
          credit: tx.credit,
          debit: tx.debit,
          balance: tx.balance,
          currency: "EUR",
        });
        txInserted++;
      }
    }

    // Update exchange last sync
    await db.update(exchanges).set({ lastSync: new Date().toISOString() }).where(eq(exchanges.id, exchange.id));

    return NextResponse.json({
      success: true,
      imported: {
        securities: securities?.length || 0,
        crypto: crypto?.length || 0,
        cash: cashBalance != null ? 1 : 0,
        transactions: transactions?.length || 0,
        transactionsInserted: txInserted,
        transactionsSkipped: txSkipped,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
