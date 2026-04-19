import { db, schema } from "@/lib/db";
import { and, eq, gte } from "drizzle-orm";
import { getEurPerUsd } from "@/lib/currency-rates";
import { classifyAsset } from "../allocation/classify";

export type TaxBucket = "crypto" | "traditional";

export interface PositionPnL {
  symbol: string;
  bucket: TaxBucket;
  amount: number;
  avgBuyEur: number;
  currentEur: number;
  costBasisEur: number;
  currentValueEur: number;
  pnlEur: number;
  pnlPct: number;
}

function bucketOf(symbol: string): TaxBucket | null {
  const cls = classifyAsset(symbol);
  if (cls === "cash") return null;
  if (cls === "crypto") return "crypto";
  return "traditional";
}

export interface UnrealizedByBucket {
  crypto: { lossEur: number; positions: PositionPnL[] };
  traditional: { lossEur: number; positions: PositionPnL[] };
}

export async function computeUnrealizedPnL(): Promise<{
  all: PositionPnL[];
  byBucket: UnrealizedByBucket;
}> {
  const eurPerUsd = await getEurPerUsd();
  const assets = await db.select().from(schema.assets);

  const bySymbol = new Map<string, { amount: number; costUsd: number; curUsd: number }>();
  for (const a of assets) {
    if (!a.amount || a.amount <= 0) continue;
    if (!a.avgBuyPrice || !a.currentPrice) continue;
    const key = a.symbol;
    const entry = bySymbol.get(key) ?? { amount: 0, costUsd: 0, curUsd: 0 };
    entry.amount += a.amount;
    entry.costUsd += a.amount * a.avgBuyPrice;
    entry.curUsd += a.amount * a.currentPrice;
    bySymbol.set(key, entry);
  }

  const all: PositionPnL[] = [];
  const byBucket: UnrealizedByBucket = {
    crypto: { lossEur: 0, positions: [] },
    traditional: { lossEur: 0, positions: [] },
  };

  for (const [symbol, agg] of bySymbol) {
    const bucket = bucketOf(symbol);
    if (!bucket) continue;
    const costBasisEur = agg.costUsd * eurPerUsd;
    const currentValueEur = agg.curUsd * eurPerUsd;
    const pnlEur = currentValueEur - costBasisEur;
    const pnlPct = costBasisEur > 0 ? (pnlEur / costBasisEur) * 100 : 0;
    const pos: PositionPnL = {
      symbol,
      bucket,
      amount: agg.amount,
      avgBuyEur: agg.amount > 0 ? (agg.costUsd / agg.amount) * eurPerUsd : 0,
      currentEur: agg.amount > 0 ? (agg.curUsd / agg.amount) * eurPerUsd : 0,
      costBasisEur,
      currentValueEur,
      pnlEur,
      pnlPct,
    };
    all.push(pos);
    if (pnlEur < 0) {
      byBucket[bucket].lossEur += pnlEur;
      byBucket[bucket].positions.push(pos);
    }
  }

  byBucket.crypto.positions.sort((a, b) => a.pnlEur - b.pnlEur);
  byBucket.traditional.positions.sort((a, b) => a.pnlEur - b.pnlEur);
  return { all, byBucket };
}

export async function estimateRealizedYtdEur(now: Date): Promise<{
  crypto: number;
  traditional: number;
  sellCount: number;
}> {
  const eurPerUsd = await getEurPerUsd();
  const yearStart = `${now.getUTCFullYear()}-01-01`;
  const sells = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.type, "sell"), gte(schema.transactions.date, yearStart)));

  const assets = await db.select().from(schema.assets);
  const avgBySymbol = new Map<string, number>();
  for (const a of assets) {
    if (!a.avgBuyPrice || a.avgBuyPrice <= 0) continue;
    if (!avgBySymbol.has(a.symbol)) avgBySymbol.set(a.symbol, a.avgBuyPrice);
  }

  let crypto = 0;
  let traditional = 0;
  for (const tx of sells) {
    const bucket = bucketOf(tx.symbol);
    if (!bucket) continue;
    const avgUsd = avgBySymbol.get(tx.symbol);
    if (!avgUsd) continue;
    const grossUsd = Number(tx.total ?? (tx.amount * (tx.price ?? 0)));
    if (!Number.isFinite(grossUsd) || grossUsd <= 0) continue;
    const costUsd = tx.amount * avgUsd;
    const pnlUsd = grossUsd - costUsd;
    const pnlEur = pnlUsd * eurPerUsd;
    if (bucket === "crypto") crypto += pnlEur;
    else traditional += pnlEur;
  }

  return { crypto, traditional, sellCount: sells.length };
}

export function daysToYearEnd(now: Date): number {
  const end = Date.UTC(now.getUTCFullYear(), 11, 31);
  return Math.max(0, Math.ceil((end - now.getTime()) / 86400000));
}
