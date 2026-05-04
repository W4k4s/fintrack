import { db, schema } from "@/lib/db";
import { getExchangeInfo } from "@/lib/exchanges/registry";
import { getEurPerUsd } from "@/lib/currency-rates";
import { ASSET_CLASSES, classifyAsset, type AssetClass } from "./classify";

export interface AllocationSnapshot {
  netWorthEur: number;
  byClass: Record<AssetClass, { valueEur: number; pct: number }>;
}

export async function computeAllocation(eurPerUsd?: number): Promise<AllocationSnapshot> {
  const [assets, accounts, exchanges, rate] = await Promise.all([
    db.select().from(schema.assets),
    db.select().from(schema.accounts),
    db.select().from(schema.exchanges),
    eurPerUsd != null ? Promise.resolve(eurPerUsd) : getEurPerUsd(),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const exchangeMap = new Map(exchanges.map((e) => [e.id, e]));

  const byClass: Record<AssetClass, { valueEur: number; pct: number }> = {
    cash: { valueEur: 0, pct: 0 },
    crypto: { valueEur: 0, pct: 0 },
    etfs: { valueEur: 0, pct: 0 },
    gold: { valueEur: 0, pct: 0 },
    bonds: { valueEur: 0, pct: 0 },
    stocks: { valueEur: 0, pct: 0 },
  };

  let netWorthEur = 0;
  for (const asset of assets) {
    const account = accountMap.get(asset.accountId);
    const exchange = account ? exchangeMap.get(account.exchangeId) : null;
    const info = exchange ? getExchangeInfo(exchange.slug) : null;
    // assets.currentPrice está en USD (ver docs/CURRENCY-NORMALIZATION.md +
    // /api/prices/route.ts:99). Convertimos aquí a EUR para que el contrato
    // público de allocation sea EUR-real, no USD-equiv.
    const valueEur = asset.amount * (asset.currentPrice || 0) * rate;

    // Banking counts as cash for allocation purposes.
    const cls: AssetClass = info?.category === "bank" ? "cash" : classifyAsset(asset.symbol);
    byClass[cls].valueEur += valueEur;
    netWorthEur += valueEur;
  }

  if (netWorthEur > 0) {
    for (const cls of ASSET_CLASSES) {
      byClass[cls].pct = (byClass[cls].valueEur / netWorthEur) * 100;
    }
  }

  return { netWorthEur, byClass };
}
