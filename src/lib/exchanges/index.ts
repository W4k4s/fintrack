import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto/encryption";
import { CcxtAdapter } from "./ccxt-adapter";
import { ManualAdapter } from "./manual-adapter";
import { ExchangeAdapter } from "./adapter";
import { getExchangeInfo } from "./registry";

export function getAdapter(exchange: typeof schema.exchanges.$inferSelect): ExchangeAdapter {
  const info = getExchangeInfo(exchange.slug);
  if (!info || info.type === "manual") {
    return new ManualAdapter();
  }
  const apiKey = exchange.apiKey ? decrypt(exchange.apiKey) : "";
  const apiSecret = exchange.apiSecret ? decrypt(exchange.apiSecret) : "";
  const passphrase = exchange.passphrase ? decrypt(exchange.passphrase) : undefined;
  return new CcxtAdapter(exchange.slug, apiKey, apiSecret, passphrase);
}

export async function syncExchange(exchangeId: number) {
  const [exchange] = await db.select().from(schema.exchanges).where(eq(schema.exchanges.id, exchangeId)).limit(1);
  if (!exchange) throw new Error("Exchange not found");

  const adapter = getAdapter(exchange);
  const balances = await adapter.fetchBalances();

  // Get or create account
  let [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.exchangeId, exchangeId)).limit(1);
  if (!account) {
    const [created] = await db.insert(schema.accounts).values({
      exchangeId,
      name: `${exchange.name} Spot`,
      type: "spot",
    }).returning();
    account = created;
  }

  // Get prices for all symbols
  const symbols = balances.map(b => b.symbol);
  const prices = await adapter.fetchPrices(symbols);

  // Upsert assets
  for (const balance of balances) {
    const [existing] = await db.select().from(schema.assets)
      .where(and(eq(schema.assets.accountId, account.id), eq(schema.assets.symbol, balance.symbol)))
      .limit(1);

    const price = prices[balance.symbol] || null;

    if (existing) {
      await db.update(schema.assets)
        .set({ amount: balance.total, currentPrice: price, lastUpdated: new Date().toISOString() })
        .where(eq(schema.assets.id, existing.id));
    } else {
      await db.insert(schema.assets).values({
        accountId: account.id,
        symbol: balance.symbol,
        amount: balance.total,
        currentPrice: price,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  // Also sync trades (if the adapter supports it).
  // Previously this was a separate "Sync trades" button and the main Sync
  // only refreshed balances — which meant new buys didn't flow into DCA matching
  // until the user clicked the second button. Unify here.
  let tradesInserted = 0;
  let tradesSkipped = 0;
  if (adapter.fetchTrades) {
    try {
      const existingTxs = await db.select().from(schema.transactions)
        .where(eq(schema.transactions.accountId, account.id));
      const existingIds = new Set(
        existingTxs.map(t => `${t.date}|${t.symbol}|${t.amount}|${t.price}`),
      );

      const trades = await adapter.fetchTrades();
      for (const trade of trades) {
        const key = `${trade.date.split("T")[0]}|${trade.symbol}|${trade.amount}|${trade.price}`;
        if (existingIds.has(key)) {
          tradesSkipped++;
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
        tradesInserted++;
      }
    } catch (e) {
      console.error(`Trade sync failed for ${exchange.name}:`, e);
    }
  }

  await db.update(schema.exchanges)
    .set({ lastSync: new Date().toISOString() })
    .where(eq(schema.exchanges.id, exchangeId));

  return { synced: balances.length, tradesInserted, tradesSkipped };
}
