/**
 * Concentration risk helpers. Puro, testeable sin DB.
 * Top-N share + HHI (Herfindahl-Hirschman Index) sobre posiciones individuales.
 */

export interface PositionValue {
  symbol: string;
  assetClass: string | null;
  valueEur: number;
}

export interface PositionShare {
  symbol: string;
  assetClass: string | null;
  valueEur: number;
  pct: number;
}

export interface ConcentrationSnapshot {
  netWorthEur: number;
  positions: PositionShare[];
  topShare: { n1: number; n3: number; n5: number };
  hhi: number; // 0..10000 (percent squared sum)
  topPosition: PositionShare | null;
}

/** Agrupa por (symbol, assetClass) sumando valueEur. */
export function aggregatePositions(raw: PositionValue[]): PositionValue[] {
  const map = new Map<string, PositionValue>();
  for (const p of raw) {
    const key = `${p.symbol}::${p.assetClass ?? ""}`;
    const acc = map.get(key);
    if (acc) acc.valueEur += p.valueEur;
    else map.set(key, { ...p });
  }
  return [...map.values()];
}

export function computeConcentration(positions: PositionValue[]): ConcentrationSnapshot {
  const positive = positions.filter((p) => p.valueEur > 0);
  const netWorth = positive.reduce((s, p) => s + p.valueEur, 0);
  if (netWorth <= 0) {
    return {
      netWorthEur: 0,
      positions: [],
      topShare: { n1: 0, n3: 0, n5: 0 },
      hhi: 0,
      topPosition: null,
    };
  }

  const shares: PositionShare[] = positive
    .map((p) => ({
      symbol: p.symbol,
      assetClass: p.assetClass,
      valueEur: p.valueEur,
      pct: (p.valueEur / netWorth) * 100,
    }))
    .sort((a, b) => b.valueEur - a.valueEur);

  const sumTop = (n: number) => shares.slice(0, n).reduce((s, p) => s + p.pct, 0);
  const hhi = shares.reduce((s, p) => s + p.pct * p.pct, 0);

  return {
    netWorthEur: netWorth,
    positions: shares,
    topShare: { n1: sumTop(1), n3: sumTop(3), n5: sumTop(5) },
    hhi,
    topPosition: shares[0] ?? null,
  };
}

export type ConcentrationSeverity = "med" | "high" | "critical";

export interface ConcentrationHit {
  kind: "top1" | "top3";
  pct: number;
  threshold: number;
  excessEur: number;
  severity: ConcentrationSeverity;
}

/** Umbrales absolutos sobre % net worth. Top-3 y top-1 evaluados por separado. */
export const CONCENTRATION_THRESHOLDS = {
  top3: { med: 50, high: 60, critical: 70 },
  top1: { med: 30, high: 40, critical: 50 },
} as const;

export function evaluateConcentration(snap: ConcentrationSnapshot): ConcentrationHit[] {
  if (snap.netWorthEur <= 0) return [];
  const hits: ConcentrationHit[] = [];

  const classify = (pct: number, t: { med: number; high: number; critical: number }): ConcentrationSeverity | null => {
    if (pct >= t.critical) return "critical";
    if (pct >= t.high) return "high";
    if (pct >= t.med) return "med";
    return null;
  };

  const top3Sev = classify(snap.topShare.n3, CONCENTRATION_THRESHOLDS.top3);
  if (top3Sev) {
    const applicableThreshold =
      top3Sev === "critical"
        ? CONCENTRATION_THRESHOLDS.top3.critical
        : top3Sev === "high"
          ? CONCENTRATION_THRESHOLDS.top3.high
          : CONCENTRATION_THRESHOLDS.top3.med;
    hits.push({
      kind: "top3",
      pct: snap.topShare.n3,
      threshold: applicableThreshold,
      excessEur: Math.max(0, ((snap.topShare.n3 - applicableThreshold) / 100) * snap.netWorthEur),
      severity: top3Sev,
    });
  }

  const top1Sev = classify(snap.topShare.n1, CONCENTRATION_THRESHOLDS.top1);
  if (top1Sev) {
    const applicableThreshold =
      top1Sev === "critical"
        ? CONCENTRATION_THRESHOLDS.top1.critical
        : top1Sev === "high"
          ? CONCENTRATION_THRESHOLDS.top1.high
          : CONCENTRATION_THRESHOLDS.top1.med;
    hits.push({
      kind: "top1",
      pct: snap.topShare.n1,
      threshold: applicableThreshold,
      excessEur: Math.max(0, ((snap.topShare.n1 - applicableThreshold) / 100) * snap.netWorthEur),
      severity: top1Sev,
    });
  }

  return hits;
}

export function hitsToSeverity(hits: ConcentrationHit[]): ConcentrationSeverity | null {
  if (hits.length === 0) return null;
  const ranks: Record<ConcentrationSeverity, number> = { med: 1, high: 2, critical: 3 };
  return hits.reduce<ConcentrationSeverity>(
    (acc, h) => (ranks[h.severity] > ranks[acc] ? h.severity : acc),
    "med",
  );
}

/**
 * HHI interpretativo:
 * - <1500: baja concentración
 * - 1500-2500: moderada
 * - >2500: alta
 * (escala CMA/DoJ para industrias; aquí aplicada informativamente).
 */
export function hhiLabel(hhi: number): "baja" | "moderada" | "alta" {
  if (hhi >= 2500) return "alta";
  if (hhi >= 1500) return "moderada";
  return "baja";
}
