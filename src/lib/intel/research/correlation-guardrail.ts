import { computeCorrelationVsTopHoldings, type HoldingCorr } from "./correlation-holdings";
import { fetchPriceHistory } from "./fetcher";

// Strategy V2 Fase 2 — guardrail de correlación al abrir una posición nueva
// (promote_watching / promote_open de intel_assets_tracked, o POST plan DCA).
// Regla: si corr 90d > 0.8 con algún holding que pese > 10% del portfolio,
// la acción se bloquea. Override explícito vía flag en el body.

export const CORR_THRESHOLD = 0.8;
export const WEIGHT_PCT_THRESHOLD = 10;

export interface GuardrailHit {
  symbol: string;
  weightPct: number;
  corr90d: number;
}

export type GuardrailDecision =
  | {
      outcome: "pass";
      holdings: HoldingCorr[];
    }
  | {
      outcome: "blocked";
      hits: GuardrailHit[];
      holdings: HoldingCorr[];
    }
  | {
      outcome: "overridden";
      hits: GuardrailHit[];
      holdings: HoldingCorr[];
    }
  | {
      outcome: "skipped";
      reason: string;
    };

/**
 * Evalúa el guardrail para `ticker`. Devuelve `skipped` si no puede calcular
 * (fetch roto, sin holdings que comparar, etc.) — en ese caso el caller
 * decide si bloquear o pasar (por defecto pasa con warning). `overridden`
 * implica que el caller debe marcar el record con override_corr_warning.
 */
export async function evaluateCorrelationGuardrail(
  ticker: string,
  opts: { override?: boolean } = {},
): Promise<GuardrailDecision> {
  const hist = await fetchPriceHistory(ticker, 95);
  if (!hist.ok) {
    return { outcome: "skipped", reason: `fetch_failed:${hist.reason}` };
  }
  const holdings = await computeCorrelationVsTopHoldings(hist.data.points, 5);
  if (holdings.length === 0) {
    return { outcome: "skipped", reason: "no_holdings_to_compare" };
  }

  const hits: GuardrailHit[] = [];
  for (const h of holdings) {
    if (h.corr90d == null) continue;
    if (h.corr90d > CORR_THRESHOLD && h.weightPct > WEIGHT_PCT_THRESHOLD) {
      hits.push({ symbol: h.symbol, weightPct: h.weightPct, corr90d: h.corr90d });
    }
  }

  if (hits.length === 0) return { outcome: "pass", holdings };
  if (opts.override) return { outcome: "overridden", hits, holdings };
  return { outcome: "blocked", hits, holdings };
}
