// Server-side currency rate helper. Fetches USD-based rates from
// exchangerate-api and caches for 1h to avoid hammering the API.
// Use from route handlers that need USD→EUR (or any) conversion.

let cache: { rates: Record<string, number>; ts: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

const FALLBACK: Record<string, number> = { USD: 1, EUR: 0.85, GBP: 0.79 };

export async function getRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.rates;
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    const rates = data.rates || FALLBACK;
    cache = { rates, ts: Date.now() };
    return rates;
  } catch {
    return cache?.rates || FALLBACK;
  }
}

export async function getEurPerUsd(): Promise<number> {
  const rates = await getRates();
  return rates.EUR || FALLBACK.EUR;
}

export async function usdToEur(usd: number): Promise<number> {
  const rate = await getEurPerUsd();
  return usd * rate;
}
