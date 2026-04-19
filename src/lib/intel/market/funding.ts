// Binance Futures funding rate (USDT-margined perpetuals).
// lastFundingRate is a decimal per 8h interval (e.g. "0.0001" = +0.01%/8h).

export interface FundingRate {
  asset: string;
  symbol: string;
  rate: number;
  nextFundingTime: number;
}

const SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
};

async function fetchOne(asset: string, symbol: string): Promise<FundingRate | null> {
  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = Number(data?.lastFundingRate);
    if (!Number.isFinite(rate)) return null;
    return {
      asset,
      symbol,
      rate,
      nextFundingTime: Number(data?.nextFundingTime) || 0,
    };
  } catch {
    return null;
  }
}

export async function fetchFundingRates(): Promise<FundingRate[]> {
  const results = await Promise.all(
    Object.entries(SYMBOLS).map(([asset, symbol]) => fetchOne(asset, symbol)),
  );
  return results.filter((r): r is FundingRate => r !== null);
}
