import { fetchFundingRates, type FundingRate } from "./market/funding";
import { fetchVix, type VixSnapshot } from "./market/vix";
import { fetchBasisBtc, type BasisSnapshot } from "./market/basis";
import type { AssetClass } from "./allocation/classify";
import type { StrategyPolicies } from "../strategy/policies";

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

// Basis futures-spot BTC ~3m. Backwardation profunda (future barato) sugiere
// estrés que suele preceder rebotes; contango alto significa que el carry es
// caro y los apalancados están pagando mucho por estar largos (sobrecalentamiento).
export function basisBoost(basisPct: number): number {
  if (basisPct <= -0.5) return 0.2; // backwardation fuerte
  if (basisPct >= 3) return -0.15; // contango alto (>12%/año anualizado aprox)
  return 0;
}

export function cryptoMultiplier(
  fg: number,
  funding: FundingRate | null,
  basis: BasisSnapshot | null = null,
): {
  value: number;
  fgMult: number;
  fundingBoost: number;
  basisBoost: number;
} {
  const fgMult = fgBaseMultiplier(fg);
  const fBoost = funding ? fundingBoost(funding.rate) : 0;
  const bBoost = basis ? basisBoost(basis.basisPct) : 0;
  const raw = fgMult + fBoost + bBoost;
  const value = Math.max(0.5, Math.min(2.5, raw));
  return { value, fgMult, fundingBoost: fBoost, basisBoost: bBoost };
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
  basisBtc: BasisSnapshot | null;
  // Refactor R1: allocation crypto actual (% de net worth). Policy-aware
  // pause sólo puede gatear si sabe el estado; si no se provee, el gate no
  // aplica y el comportamiento es idéntico al pre-R1.
  cryptoAllocationPct?: number;
}

export async function loadMultiplierContext(
  fg: number,
  opts: { cryptoAllocationPct?: number } = {},
): Promise<MultiplierContext> {
  const [fundingRates, vix, basisBtc] = await Promise.all([
    fetchFundingRates(),
    fetchVix(),
    fetchBasisBtc(),
  ]);
  const fundingByAsset = new Map(fundingRates.map((r) => [r.asset, r]));
  return { fg, fundingByAsset, vix, basisBtc, cryptoAllocationPct: opts.cryptoAllocationPct };
}

export interface AppliedMultiplier {
  rule: "crypto" | "equity" | "fixed";
  value: number;
  components: {
    fgMult?: number;
    fundingBoost?: number;
    fundingRate?: number | null;
    basisBoost?: number;
    basisPct?: number | null;
    vixLevel?: number | null;
    // Refactor R1: si el gate de policy desactiva el multiplicador,
    // marcamos el motivo para auditabilidad downstream (digest/schedule).
    gated?: "crypto_paused" | "asset_not_in_scope";
    gateContext?: Record<string, unknown>;
  };
}

export function multiplierFor(
  cls: AssetClass,
  asset: string,
  ctx: MultiplierContext,
  policies?: StrategyPolicies,
): AppliedMultiplier {
  const rule = ruleForClass(cls);
  if (rule === "crypto") {
    // Refactor R1 gates: pausa total por allocation y scope por asset.
    // Sólo aplican si `policies` se pasa explícitamente — sin policies el
    // comportamiento es idéntico al pre-R1 (regression).
    if (policies) {
      const mp = policies.multiplier;
      if (
        typeof ctx.cryptoAllocationPct === "number" &&
        ctx.cryptoAllocationPct >= mp.requiresCryptoUnderPct
      ) {
        return {
          rule,
          value: 1.0,
          components: {
            gated: "crypto_paused",
            gateContext: {
              cryptoAllocPct: ctx.cryptoAllocationPct,
              threshold: mp.requiresCryptoUnderPct,
            },
          },
        };
      }
      if (!mp.appliesTo.includes(asset)) {
        return {
          rule,
          value: 1.0,
          components: {
            gated: "asset_not_in_scope",
            gateContext: { asset, allowedAssets: mp.appliesTo },
          },
        };
      }
    }

    const funding = ctx.fundingByAsset.get(asset) ?? ctx.fundingByAsset.get("BTC") ?? null;
    const { value, fgMult, fundingBoost: fBoost, basisBoost: bBoost } = cryptoMultiplier(
      ctx.fg,
      funding,
      ctx.basisBtc,
    );
    return {
      rule,
      value,
      components: {
        fgMult,
        fundingBoost: fBoost,
        fundingRate: funding?.rate ?? null,
        basisBoost: bBoost,
        basisPct: ctx.basisBtc?.basisPct ?? null,
      },
    };
  }
  if (rule === "equity") {
    const { value, vix } = equityMultiplier(ctx.vix);
    return { rule, value, components: { vixLevel: vix } };
  }
  return { rule, value: 1.0, components: {} };
}
