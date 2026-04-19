import { db, schema } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import { getRates } from "@/lib/currency-rates";

const USD_STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

/**
 * Convert an amount given in `quoteCurrency` into USD.
 * rates[X] = X per 1 USD. So amount_usd = amount / rates[X].
 * EUR: rates.EUR ~ 0.85. Stablecoins treated 1:1 with USD.
 */
function toUsd(amount: number, quoteCurrency: string | null | undefined, rates: Record<string, number>): number {
  const q = (quoteCurrency || "USD").toUpperCase();
  if (q === "USD") return amount;
  if (USD_STABLECOINS.has(q)) return amount;
  const rate = rates[q];
  if (!rate || rate <= 0) return amount; // unknown quote — best effort
  return amount / rate;
}

/**
 * Recompute `avgBuyPrice` (USD) for every assets row of `symbol` based on the
 * transactions history. FIFO-lite: SELLs reduce remaining amount proportionally
 * but do not change avgBuyPrice (typical weighted-average cost-basis model).
 *
 * Writes to every `assets` row sharing `symbol` — same symbol can appear in
 * multiple exchange accounts but the cost basis is a property of the holding.
 * Callers that need per-exchange basis should stop using this helper.
 *
 * Returns the computed avgBuyPrice in USD (or null if no data).
 */
export async function recomputeAvgBuyPrice(symbol: string): Promise<number | null> {
  if (!symbol) return null;

  const txs = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.symbol, symbol))
    .orderBy(asc(schema.transactions.date), asc(schema.transactions.id));

  if (txs.length === 0) return null;

  const rates = await getRates();

  let cumulativeUnits = 0;
  let cumulativeCostUsd = 0;

  for (const tx of txs) {
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (tx.type === "buy") {
      const priceQuote = tx.price != null ? Number(tx.price) : null;
      const totalQuote = tx.total != null ? Number(tx.total) : null;
      const grossQuote = totalQuote && totalQuote > 0 ? totalQuote : priceQuote ? priceQuote * amount : 0;
      if (grossQuote <= 0) continue;
      const grossUsd = toUsd(grossQuote, tx.quoteCurrency, rates);
      cumulativeUnits += amount;
      cumulativeCostUsd += grossUsd;
    } else if (tx.type === "sell") {
      if (cumulativeUnits <= 0) continue;
      const soldUnits = Math.min(amount, cumulativeUnits);
      const avgNow = cumulativeCostUsd / cumulativeUnits;
      cumulativeUnits -= soldUnits;
      cumulativeCostUsd -= avgNow * soldUnits;
    }
  }

  if (cumulativeUnits <= 0 || cumulativeCostUsd <= 0) return null;

  const avgBuyUsd = cumulativeCostUsd / cumulativeUnits;

  await db
    .update(schema.assets)
    .set({ avgBuyPrice: avgBuyUsd })
    .where(eq(schema.assets.symbol, symbol));

  return avgBuyUsd;
}

/**
 * Fire-and-forget wrapper: logs but never throws. Intended for write paths
 * where we want to update cost basis opportunistically without breaking the
 * write transaction if anything goes sideways.
 */
export async function tryRecomputeAvgBuyPrice(symbol: string): Promise<void> {
  try {
    await recomputeAvgBuyPrice(symbol);
  } catch (err) {
    console.error(`[cost-basis] recompute failed for ${symbol}`, err);
  }
}

export async function recomputeAllAvgBuyPrices(): Promise<{ symbol: string; avgBuyUsd: number | null }[]> {
  const rows = await db.selectDistinct({ symbol: schema.transactions.symbol }).from(schema.transactions);
  const results: { symbol: string; avgBuyUsd: number | null }[] = [];
  for (const row of rows) {
    const avg = await recomputeAvgBuyPrice(row.symbol);
    results.push({ symbol: row.symbol, avgBuyUsd: avg });
  }
  return results;
}
