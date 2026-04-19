/**
 * Correlación entre activos a partir de series de precios diarios.
 * Helpers puros, testables sin DB ni red.
 *
 * Uso típico: fetchar N series de precios (same length, aligned by day),
 * convertir a log-returns, computar matriz pairwise y resumir con la
 * media off-diagonal. Un valor alto indica que los activos mueven en
 * bloque — mala diversificación.
 */

export type CorrelationSeverity = "med" | "high";

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (prev > 0 && curr > 0 && Number.isFinite(prev) && Number.isFinite(curr)) {
      out.push(Math.log(curr / prev));
    }
  }
  return out;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return null;
  return num / denom;
}

export interface PairCorr {
  a: string;
  b: string;
  corr: number;
}

/**
 * Construye la matriz pairwise sobre series dadas. `series` es un map
 * symbol → log-returns alineados (misma longitud recomendada; el cálculo
 * trunca al mínimo). Devuelve solo los pares únicos (a<b), sin diagonal.
 */
export function pairwiseCorrelations(
  series: Record<string, number[]>,
): PairCorr[] {
  const symbols = Object.keys(series).sort();
  const pairs: PairCorr[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = symbols[i];
      const b = symbols[j];
      const c = pearson(series[a], series[b]);
      if (c != null) {
        pairs.push({ a, b, corr: c });
      }
    }
  }
  return pairs;
}

export function averageCorrelation(pairs: PairCorr[]): number | null {
  if (pairs.length === 0) return null;
  return mean(pairs.map((p) => p.corr));
}

export const CORRELATION_THRESHOLDS = {
  med: 0.85,
  high: 0.92,
} as const;

export function classifyCorrelation(avg: number | null): CorrelationSeverity | null {
  if (avg == null) return null;
  if (avg >= CORRELATION_THRESHOLDS.high) return "high";
  if (avg >= CORRELATION_THRESHOLDS.med) return "med";
  return null;
}
