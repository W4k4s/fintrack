import { db, schema } from "@/lib/db";
import { getExchangeInfo } from "@/lib/exchanges/registry";
import { ASSET_CLASSES, classifyAsset, type AssetClass } from "./classify";

export interface AllocationSnapshot {
  netWorth: number;
  byClass: Record<AssetClass, { value: number; pct: number }>;
}

export async function computeAllocation(): Promise<AllocationSnapshot> {
  const [assets, accounts, exchanges] = await Promise.all([
    db.select().from(schema.assets),
    db.select().from(schema.accounts),
    db.select().from(schema.exchanges),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const exchangeMap = new Map(exchanges.map((e) => [e.id, e]));

  const byClass: Record<AssetClass, { value: number; pct: number }> = {
    cash: { value: 0, pct: 0 },
    crypto: { value: 0, pct: 0 },
    etfs: { value: 0, pct: 0 },
    gold: { value: 0, pct: 0 },
    bonds: { value: 0, pct: 0 },
    stocks: { value: 0, pct: 0 },
  };

  let netWorth = 0;
  for (const asset of assets) {
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    const info = exchange ? getExchangeInfo(exchange.slug) : null;
    const value = asset.amount * (asset.currentPrice || 0);

    // Banking counts as cash for allocation purposes.
    const cls: AssetClass = info?.category === "bank" ? "cash" : classifyAsset(asset.symbol);
    byClass[cls].value += value;
    netWorth += value;
  }

  if (netWorth > 0) {
    for (const cls of ASSET_CLASSES) {
      byClass[cls].pct = (byClass[cls].value / netWorth) * 100;
    }
  }

  return { netWorth, byClass };
}
