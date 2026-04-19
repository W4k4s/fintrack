// Deribit public API — BTC futures basis vs spot index.
// Basis = (future_mark_price - spot_price) / spot_price * 100  (en %)
// Contango (>0): futuros caros (carry normal en bull). Muy alto => sobrecalentamiento.
// Backwardation (<0): futuros baratos — suele aparecer en pánico / short squeeze previos.

export interface BasisSnapshot {
  asset: string; // "BTC"
  spotPrice: number;
  futurePrice: number;
  /** Basis absoluto: (future - spot) / spot * 100 (%). */
  basisPct: number;
  /** Tiempo a expiración del contrato en días. */
  daysToExpiry: number;
  instrumentName: string;
  asOf: number;
}

const DERIBIT_API = "https://www.deribit.com/api/v2";

async function getJson<T = unknown>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      next: { revalidate: 600 },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface DeribitIndexResponse {
  result: { index_price: number };
}

interface DeribitFutureSummary {
  instrument_name: string;
  mark_price: number | null;
  underlying_price?: number | null;
  creation_timestamp?: number;
  mid_price?: number | null;
}

interface DeribitBookSummaryResponse {
  result: DeribitFutureSummary[];
}

interface DeribitInstrumentResponse {
  result: Array<{
    instrument_name: string;
    expiration_timestamp: number;
    kind: string;
    settlement_period?: string;
  }>;
}

/**
 * Elige el future BTC más cercano a `targetDays` días a expiración.
 * Deribit ofrece perpetual + vencimientos concretos (monthly/quarterly).
 * Filtramos los que tienen expiration (ignoramos perpetual) y buscamos el
 * contrato más próximo al objetivo.
 */
export async function fetchBasisBtc(
  targetDays = 90,
): Promise<BasisSnapshot | null> {
  const [spotJson, instrumentsJson] = await Promise.all([
    getJson<DeribitIndexResponse>(`${DERIBIT_API}/public/get_index_price?index_name=btc_usd`),
    getJson<DeribitInstrumentResponse>(
      `${DERIBIT_API}/public/get_instruments?currency=BTC&kind=future&expired=false`,
    ),
  ]);

  const spot = Number(spotJson?.result?.index_price);
  if (!Number.isFinite(spot) || spot <= 0) return null;

  const candidates = instrumentsJson?.result ?? [];
  if (candidates.length === 0) return null;

  const now = Date.now();
  let best: { name: string; expTs: number; diffDays: number } | null = null;
  for (const inst of candidates) {
    if (inst.kind !== "future") continue;
    if (!Number.isFinite(inst.expiration_timestamp)) continue;
    if (inst.expiration_timestamp <= now) continue;
    const daysOut = (inst.expiration_timestamp - now) / 86_400_000;
    if (daysOut <= 0 || daysOut > 365) continue;
    const diff = Math.abs(daysOut - targetDays);
    if (!best || diff < best.diffDays) {
      best = { name: inst.instrument_name, expTs: inst.expiration_timestamp, diffDays: diff };
    }
  }
  if (!best) return null;

  const bookJson = await getJson<DeribitBookSummaryResponse>(
    `${DERIBIT_API}/public/get_book_summary_by_instrument?instrument_name=${best.name}`,
  );
  const summary = bookJson?.result?.[0];
  if (!summary) return null;
  const future = Number(summary.mark_price ?? summary.mid_price);
  if (!Number.isFinite(future) || future <= 0) return null;

  const basisPct = ((future - spot) / spot) * 100;
  const daysToExpiry = (best.expTs - now) / 86_400_000;

  return {
    asset: "BTC",
    spotPrice: spot,
    futurePrice: future,
    basisPct: Math.round(basisPct * 10000) / 10000,
    daysToExpiry: Math.round(daysToExpiry * 10) / 10,
    instrumentName: best.name,
    asOf: now,
  };
}
