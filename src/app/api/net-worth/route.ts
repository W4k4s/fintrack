import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, like } from "drizzle-orm";
import { getExchangeInfo } from "@/lib/exchanges/registry";

export async function GET() {
  const assets = await db.select().from(schema.assets);
  const accounts = await db.select().from(schema.accounts);
  const exchanges = await db.select().from(schema.exchanges);
  const bankAccountsList = await db.select().from(schema.bankAccounts);

  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const exchangeMap = new Map(exchanges.map(e => [e.id, e]));

  // Build per-exchange breakdown
  const byExchange = new Map<number, {
    id: number; name: string; slug: string; category: string; logo: string;
    assets: { symbol: string; amount: number; value: number; price: number }[];
    totalValue: number;
  }>();

  let portfolioValue = 0;
  let bankingValue = 0;

  for (const asset of assets) {
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    if (!exchange) continue;

    const info = getExchangeInfo(exchange.slug);
    const value = asset.amount * (asset.currentPrice || 0);
    const category = info?.category || "exchange";

    if (category === "bank") bankingValue += value;
    else portfolioValue += value;

    if (!byExchange.has(exchange.id)) {
      byExchange.set(exchange.id, {
        id: exchange.id,
        name: exchange.name,
        slug: exchange.slug,
        category,
        logo: info?.logo || "",
        assets: [],
        totalValue: 0,
      });
    }

    const entry = byExchange.get(exchange.id)!;
    entry.assets.push({
      symbol: asset.symbol,
      amount: asset.amount,
      value,
      price: asset.currentPrice || 0,
    });
    entry.totalValue += value;
  }

  // Sort assets within each exchange by value
  for (const entry of byExchange.values()) {
    entry.assets.sort((a, b) => b.value - a.value);
  }

  // Get bank account balances
  const enrichedBankAccounts = await Promise.all(bankAccountsList.map(async (ba) => {
    const [latest] = await db.select({ balance: schema.bankTransactions.balance })
      .from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.source, ba.source))
      .orderBy(desc(schema.bankTransactions.date))
      .limit(1);

    return {
      ...ba,
      balance: latest?.balance || 0,
    };
  }));

  const accountsList = Array.from(byExchange.values()).sort((a, b) => b.totalValue - a.totalValue);

  // Get EUR/USD rate from EUR asset price
  const eurAsset = assets.find(a => a.symbol === "EUR");
  const eurUsdRate = eurAsset?.currentPrice || 1;

  return NextResponse.json({
    accounts: accountsList,
    bankAccounts: enrichedBankAccounts.map(ba => ({
      ...ba,
      balanceUsd: ba.balance * eurUsdRate,
    })),
    summary: {
      netWorth: portfolioValue + bankingValue,
      portfolio: portfolioValue,
      banking: bankingValue,
      eurUsdRate,
    },
  });
}
