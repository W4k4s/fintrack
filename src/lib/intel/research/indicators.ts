/**
 * Indicadores técnicos puros para Research Drawer.
 * Sin dependencias externas. Serie de entrada = array de closes.
 */

export function sma(prices: number[], period: number): number | null {
  if (prices.length < period || period <= 0) return null;
  const slice = prices.slice(-period);
  let s = 0;
  for (const p of slice) s += p;
  return s / period;
}

/** Wilder's RSI sobre `period` barras (estándar 14). */
export function rsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

/** EMA serie → último valor. */
export function ema(prices: number[], period: number): number | null {
  if (prices.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    val = prices[i] * k + val * (1 - k);
  }
  return val;
}

/** MACD (12, 26, 9) — devuelve línea MACD, señal y histograma actuales. */
export function macd(prices: number[]): { macd: number; signal: number; hist: number } | null {
  const fast = 12;
  const slow = 26;
  const signalP = 9;
  if (prices.length < slow + signalP) return null;
  // Serie completa de MACD para calcular la EMA de señal
  const macdSeries: number[] = [];
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);
  let emaFast = prices.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = prices.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  for (let i = 0; i < prices.length; i++) {
    if (i >= fast) emaFast = prices[i] * kFast + emaFast * (1 - kFast);
    if (i >= slow) emaSlow = prices[i] * kSlow + emaSlow * (1 - kSlow);
    if (i >= slow - 1) macdSeries.push(emaFast - emaSlow);
  }
  const kSig = 2 / (signalP + 1);
  let signal = macdSeries.slice(0, signalP).reduce((a, b) => a + b, 0) / signalP;
  for (let i = signalP; i < macdSeries.length; i++) {
    signal = macdSeries[i] * kSig + signal * (1 - kSig);
  }
  const macdVal = macdSeries[macdSeries.length - 1];
  return { macd: macdVal, signal, hist: macdVal - signal };
}

/** Bollinger Bands (20, 2σ). Devuelve %B = (price − lower) / (upper − lower). */
export function bollingerPctB(prices: number[], period = 20, mult = 2): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  const upper = mean + mult * sd;
  const lower = mean - mult * sd;
  const price = prices[prices.length - 1];
  return (price - lower) / (upper - lower);
}

/** Volatilidad anualizada (σ de log-returns × √252). */
export function annualizedVolatility(prices: number[], window = 90): number | null {
  if (prices.length < window + 1) return null;
  const slice = prices.slice(-(window + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0 && slice[i] > 0) {
      returns.push(Math.log(slice[i] / slice[i - 1]));
    }
  }
  if (returns.length < 2) return null;
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const v = returns.reduce((acc, r) => acc + (r - m) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export interface TechnicalSnapshot {
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  distToSma200Pct: number | null; // (price / sma200 − 1) × 100
  rsi14: number | null;
  macd: { macd: number; signal: number; hist: number } | null;
  bollingerPctB: number | null;
  vol90dPct: number | null; // % anualizado
}

export function computeTechnicalSnapshot(prices: number[]): TechnicalSnapshot {
  const price = prices.length > 0 ? prices[prices.length - 1] : null;
  const s200 = sma(prices, 200);
  return {
    price,
    sma50: sma(prices, 50),
    sma200: s200,
    distToSma200Pct: price != null && s200 != null && s200 > 0 ? ((price / s200) - 1) * 100 : null,
    rsi14: rsi(prices, 14),
    macd: macd(prices),
    bollingerPctB: bollingerPctB(prices),
    vol90dPct: (() => {
      const v = annualizedVolatility(prices, 90);
      return v != null ? v * 100 : null;
    })(),
  };
}
