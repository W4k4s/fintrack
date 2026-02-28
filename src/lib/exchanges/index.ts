import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
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
  const exchange = await db.query.exchanges.findFirst({
    where: eq(schema.exchanges.id, exchangeId),
  });
  if (!exchange) throw new Error("Exchange not found");

  const adapter = getAdapter(exchange);
  const balances = await adapter.fetchBalances();

  // Get or create account
  let account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.exchangeId, exchangeId),
  });
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
    const existing = await db.query.assets.findFirst({
      where: (a, { and, eq: e }) => and(e(a.accountId, account!.id), e(a.symbol, balance.symbol)),
    });

    const price = prices[balance.symbol] || null;

    if (existing) {
      await db.update(schema.assets)
        .set({ amount: balance.total, currentPrice: price, lastUpdated: new Date().toISOString() })
        .where(eq(schema.assets.id, existing.id));
    } else {
      await db.insert(schema.assets).values({
        accountId: account!.id,
        symbol: balance.symbol,
        amount: balance.total,
        currentPrice: price,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  // Update lastSync
  await db.update(schema.exchanges)
    .set({ lastSync: new Date().toISOString() })
    .where(eq(schema.exchanges.id, exchangeId));

  return { synced: balances.length };
}
