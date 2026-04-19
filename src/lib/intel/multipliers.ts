import { fetchFundingRates, type FundingRate } from "./market/funding";
import { fetchVix, type VixSnapshot } from "./market/vix";
import type { AssetClass } from "./allocation/classify";

// ---------------------------------------------------------------------------
// Crypto multiplier: F&G base + funding boost (ambas señales miran crypto).
// ---------------------------------------------------------------------------

export function fgBaseMultiplier(fg: number): number {
  if (fg <= 24) return 2.0;
  if (fg <= 44) return 1.5;
  if (fg <= 55) return 1.0;
  if (fg <= 74) return 0.75;
  return 0.5;
}

// Funding rate es "cuánto pagan los apalancados". Si cortos pagan (rate
// negativo), el mercado está saturado de bajistas → confirma miedo. Si longs
// pagan mucho, hay euforia apalancada → reduce multiplicador ligeramente.
export function fundingBoost(rate: number): number {
  if (rate <= -0.0002) return 0.25; // cortos masivos
  if (rate >= 0.0008) return -0.15; // longs apalancados
  return 0;
}

export function cryptoMultiplier(fg: number, funding: FundingRate | null): {
  value: number;
  fgMult: number;
  boost: number;
} {
  const fgMult = fgBaseMultiplier(fg);
  const boost = funding ? fundingBoost(funding.rate) : 0;
  const raw = fgMult + boost;
  const value = Math.max(0.5, Math.min(2.5, raw));
  return { value, fgMult, boost };
}

// ---------------------------------------------------------------------------
// Equity multiplier: VIX. Stress real = oportunidad acumulación,
// complacencia extrema = reducir DCA (techo probable).
// ---------------------------------------------------------------------------

export function vixMultiplier(level: number): number {
  if (level >= 40) return 2.0;
  if (level >= 30) return 1.5;
  if (level >= 20) return 1.0;
  if (level >= 15) return 0.9;
  return 0.75;
}

export function equityMultiplier(vix: VixSnapshot | null): { value: number; vix: number | null } {
  if (!vix) return { value: 1.0, vix: null };
  return { value: vixMultiplier(vix.level), vix: vix.level };
}

// ---------------------------------------------------------------------------
// Clase → regla aplicada. Gold/bonds/cash mantienen DCA mecánico (1.0x).
// ---------------------------------------------------------------------------

export function ruleForClass(cls: AssetClass): "crypto" | "equity" | "fixed" {
  if (cls === "crypto") return "crypto";
  if (cls === "etfs" || cls === "stocks") return "equity";
  return "fixed";
}

// ---------------------------------------------------------------------------
// Facade: única llamada que la UI/endpoint consume.
// ---------------------------------------------------------------------------

export interface MultiplierContext {
  fg: number;
  fundingByAsset: Map<string, FundingRate>;
  vix: VixSnapshot | null;
}

export async function loadMultiplierContext(fg: number): Promise<MultiplierContext> {
  const [fundingRates, vix] = await Promise.all([fetchFundingRates(), fetchVix()]);
  const fundingByAsset = new Map(fundingRates.map((r) => [r.asset, r]));
  return { fg, fundingByAsset, vix };
}

export interface AppliedMultiplier {
  rule: "crypto" | "equity" | "fixed";
  value: number;
  components: {
    fgMult?: number;
    fundingBoost?: number;
    fundingRate?: number | null;
    vixLevel?: number | null;
  };
}

export function multiplierFor(
  cls: AssetClass,
  asset: string,
  ctx: MultiplierContext,
): AppliedMultiplier {
  const rule = ruleForClass(cls);
  if (rule === "crypto") {
    const funding = ctx.fundingByAsset.get(asset) ?? ctx.fundingByAsset.get("BTC") ?? null;
    const { value, fgMult, boost } = cryptoMultiplier(ctx.fg, funding);
    return {
      rule,
      value,
      components: { fgMult, fundingBoost: boost, fundingRate: funding?.rate ?? null },
    };
  }
  if (rule === "equity") {
    const { value, vix } = equityMultiplier(ctx.vix);
    return { rule, value, components: { vixLevel: vix } };
  }
  return { rule, value: 1.0, components: {} };
}
