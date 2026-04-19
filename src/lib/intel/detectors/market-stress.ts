import { dedupKey, dayWindowKey } from "../dedup";
import { fetchFundingRates, type FundingRate } from "../market/funding";
import { fetchVix, type VixSnapshot } from "../market/vix";
import type { Detector, DetectorContext, DetectorSignal, Severity, SuggestedAction } from "../types";

// Funding (decimal per 8h)
const FUNDING_SHORT_SQUEEZE = -0.0002; // ≤ -0.02%/8h → cortos pagando
const FUNDING_BLOWOFF = 0.0008; // ≥ +0.08%/8h → longs apalancados

// VIX level
const VIX_HIGH = 30;
const VIX_CRITICAL = 40;
const VIX_SPIKE_PCT = 25;

interface FundingClass {
  regime: "short_squeeze" | "blowoff";
  severity: Severity;
  action: SuggestedAction;
}

function classifyFunding(rate: number): FundingClass | null {
  if (rate <= FUNDING_SHORT_SQUEEZE) {
    return { regime: "short_squeeze", severity: "high", action: "buy_accelerate" };
  }
  if (rate >= FUNDING_BLOWOFF) {
    return { regime: "blowoff", severity: "med", action: "review" };
  }
  return null;
}

function fundingSignal(fr: FundingRate, ctx: DetectorContext): DetectorSignal | null {
  const cls = classifyFunding(fr.rate);
  if (!cls) return null;
  const pct8h = fr.rate * 100;
  const apr = fr.rate * 3 * 365 * 100; // 3 funding windows/day
  const windowKey = dayWindowKey(ctx.now);

  const title =
    cls.regime === "short_squeeze"
      ? `${fr.asset} funding ${pct8h.toFixed(3)}% — cortos pagando`
      : `${fr.asset} funding ${pct8h.toFixed(3)}% — longs apalancados`;

  const summary =
    cls.regime === "short_squeeze"
      ? `Funding rate ${fr.asset} ${pct8h.toFixed(3)}%/8h (≈${apr.toFixed(0)}% APR). Cortos masivos en perps — históricamente precede rebote.`
      : `Funding rate ${fr.asset} ${pct8h.toFixed(3)}%/8h (≈${apr.toFixed(0)}% APR). Longs apalancados pagan — riesgo de liquidaciones en caída.`;

  return {
    dedupKey: dedupKey("funding_anomaly", fr.asset, `${windowKey}:${cls.regime}`),
    scope: "funding_anomaly",
    asset: fr.asset,
    assetClass: "crypto",
    severity: cls.severity,
    title,
    summary,
    payload: {
      symbol: fr.symbol,
      rate: fr.rate,
      pct8h,
      aprApprox: apr,
      regime: cls.regime,
      nextFundingTime: fr.nextFundingTime,
      thresholds: { short: FUNDING_SHORT_SQUEEZE, blowoff: FUNDING_BLOWOFF },
    },
    suggestedAction: cls.action,
  };
}

interface VixClass {
  regime: "level_critical" | "level_high" | "spike";
  severity: Severity;
}

function classifyVix(snap: VixSnapshot): VixClass | null {
  if (snap.level >= VIX_CRITICAL) return { regime: "level_critical", severity: "critical" };
  if (snap.level >= VIX_HIGH) return { regime: "level_high", severity: "high" };
  if (snap.changePct >= VIX_SPIKE_PCT) return { regime: "spike", severity: "med" };
  return null;
}

function vixSignal(snap: VixSnapshot, ctx: DetectorContext): DetectorSignal | null {
  const cls = classifyVix(snap);
  if (!cls) return null;
  const windowKey = dayWindowKey(ctx.now);

  const title =
    cls.regime === "spike"
      ? `VIX ${snap.level.toFixed(1)} (+${snap.changePct.toFixed(0)}%) — spike`
      : `VIX ${snap.level.toFixed(1)} — stress equity`;

  const summary =
    cls.regime === "level_critical"
      ? `VIX ${snap.level.toFixed(1)} (Δ${snap.changePct.toFixed(1)}%). Pánico equity tipo marzo 2020 — revisar exposure equity.`
      : cls.regime === "level_high"
        ? `VIX ${snap.level.toFixed(1)} (Δ${snap.changePct.toFixed(1)}%). Stress real en equity US — volatilidad implícita elevada.`
        : `VIX ${snap.level.toFixed(1)} (Δ+${snap.changePct.toFixed(1)}%). Spike intradía sin nivel extremo — vigilar.`;

  return {
    dedupKey: dedupKey("funding_anomaly", "VIX", `${windowKey}:${cls.regime}`),
    scope: "funding_anomaly",
    asset: "VIX",
    assetClass: "equity",
    severity: cls.severity,
    title,
    summary,
    payload: {
      level: snap.level,
      previousClose: snap.previousClose,
      changePct: snap.changePct,
      asOf: snap.asOf,
      regime: cls.regime,
      thresholds: { high: VIX_HIGH, critical: VIX_CRITICAL, spikePct: VIX_SPIKE_PCT },
    },
    suggestedAction: "review",
  };
}

export const marketStressDetector: Detector = {
  scope: "funding_anomaly",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const [fundingRates, vix] = await Promise.all([fetchFundingRates(), fetchVix()]);

    const signals: DetectorSignal[] = [];
    for (const fr of fundingRates) {
      const s = fundingSignal(fr, ctx);
      if (s) signals.push(s);
    }
    if (vix) {
      const s = vixSignal(vix, ctx);
      if (s) signals.push(s);
    }
    return signals;
  },
};
