import { db, schema } from "@/lib/db";
import { inArray } from "drizzle-orm";
import { fetchPriceHistory, resolveTicker } from "../research/fetcher";
import { rsi } from "../research/indicators";
import { getSubTargets, aggregateByParent, SUB_TO_PARENT, type SubClass } from "../allocation/sub-targets";
import { computeAllocation } from "../allocation/compute";
import { ASSET_CLASSES, type AssetClass } from "../allocation/classify";
import { dedupKey, weekWindowKey } from "../dedup";
import type { Detector, DetectorContext, DetectorSignal, Severity } from "../types";

// Strategy V2 Fase 3 — detector "opportunity".
//
// Surface candidatos de la watchlist (intel_assets_tracked.status = "watching")
// que cumplen al menos una de estas 4 reglas v1. Dedup semanal por ticker.
//
// 1) Precio actual dentro de -10% del entryPrice definido en la tesis.
// 2) RSI14 diario < 30 (sobrevendido).
// 3) Sub-clase infraponderada > 3 puntos vs target (approx a nivel parent
//    mientras F1c — classifier sub-clase — no exista).
// 4) Catalizador en dossier `upcoming_catalysts` a < 30 días.
//
// Severity: "med" por defecto, "high" si ≥2 reglas coinciden. Sesión B de F3
// añadirá un prompt Claude dedicado; mientras, la spawn usa el prompt genérico.

const RSI_THRESHOLD = 30;
const ENTRY_WINDOW_PCT = 10;
const UNDERWEIGHT_THRESHOLD_PP = 3;
const CATALYST_HORIZON_DAYS = 30;

type RuleKey = "entry_window" | "rsi_oversold" | "sub_underweight" | "catalyst_near";

interface RuleHit {
  rule: RuleKey;
  detail: Record<string, unknown>;
}

export interface Catalyst {
  event: string;
  date_estimate: string;
}

/**
 * Parsea "YYYY-MM" o "YYYY-QN" a un Date representando el inicio de la ventana
 * (primer día del mes o del trimestre). Devuelve null si no reconoce el formato.
 * Usamos el inicio de ventana para decidir "queda < 30d": si el evento puede
 * ocurrir tan pronto como ese día, lo tratamos como inminente.
 */
export function parseCatalystDate(raw: string): Date | null {
  const s = raw.trim();
  const monthMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = Number(monthMatch[1]);
    const m = Number(monthMatch[2]);
    if (m < 1 || m > 12) return null;
    return new Date(Date.UTC(y, m - 1, 1));
  }
  const qMatch = s.match(/^(\d{4})-Q([1-4])$/i);
  if (qMatch) {
    const y = Number(qMatch[1]);
    const q = Number(qMatch[2]);
    const startMonth = (q - 1) * 3;
    return new Date(Date.UTC(y, startMonth, 1));
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Regla 1: current dentro de [-10%, 0%] del entryPrice. Retorna el pct firmado
 * (negativo si current < entryPrice) o null si no aplica.
 */
export function entryWindowPct(currentPrice: number, entryPrice: number): number | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  const pct = ((currentPrice - entryPrice) / entryPrice) * 100;
  if (pct > 0) return null;
  if (pct < -ENTRY_WINDOW_PCT) return null;
  return pct;
}

/**
 * Regla 4: ¿algún catalizador cae dentro de [now, now+30d]? Retorna el más
 * próximo, o null si ninguno cualifica. Fuente: dossierJson.upcoming_catalysts.
 */
export function nearestUpcomingCatalyst(
  catalysts: Catalyst[] | undefined,
  now: Date,
): { catalyst: Catalyst; daysUntil: number } | null {
  if (!Array.isArray(catalysts) || catalysts.length === 0) return null;
  const horizonMs = CATALYST_HORIZON_DAYS * 86400_000;
  let best: { catalyst: Catalyst; daysUntil: number } | null = null;
  for (const c of catalysts) {
    if (!c || typeof c.date_estimate !== "string") continue;
    const date = parseCatalystDate(c.date_estimate);
    if (!date) continue;
    const diff = date.getTime() - now.getTime();
    if (diff < 0 || diff > horizonMs) continue;
    const days = Math.floor(diff / 86400_000);
    if (!best || days < best.daysUntil) {
      best = { catalyst: c, daysUntil: days };
    }
  }
  return best;
}

function parseDossier(raw: string | null): { upcoming_catalysts?: Catalyst[] } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { upcoming_catalysts?: Catalyst[] };
  } catch {
    return null;
  }
}

function severityFromHits(count: number): Severity | null {
  if (count <= 0) return null;
  if (count >= 2) return "high";
  return "med";
}

function ruleLabel(rule: RuleKey): string {
  switch (rule) {
    case "entry_window": return "precio en zona de entrada";
    case "rsi_oversold": return "RSI<30";
    case "sub_underweight": return "sub-clase infraponderada";
    case "catalyst_near": return "catalizador <30d";
  }
}

export const opportunityDetector: Detector = {
  scope: "opportunity",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const watchlist = await db
      .select()
      .from(schema.intelAssetsTracked)
      .where(inArray(schema.intelAssetsTracked.status, ["watching"]));

    if (watchlist.length === 0) return [];

    // Drift por parent_class para regla 3. Si fetch de targets o allocation
    // falla, desactivamos la regla silenciosamente (otras reglas siguen vivas).
    let underweightedParents = new Set<AssetClass>();
    try {
      const [subs, allocation] = await Promise.all([getSubTargets(), computeAllocation()]);
      const targetsByParent = aggregateByParent(subs);
      for (const parent of ASSET_CLASSES) {
        const target = targetsByParent[parent] ?? 0;
        const actual = allocation.byClass[parent]?.pct ?? 0;
        if (target - actual > UNDERWEIGHT_THRESHOLD_PP) {
          underweightedParents.add(parent);
        }
      }
    } catch (err) {
      console.error("[intel] opportunity: allocation lookup failed", err);
      underweightedParents = new Set();
    }

    const signals: DetectorSignal[] = [];
    const windowKey = weekWindowKey(ctx.now);

    for (const row of watchlist) {
      const hits: RuleHit[] = [];

      const priceHistory = await fetchPriceHistory(row.ticker, 60);
      const points = priceHistory.ok ? priceHistory.data.points.map((p) => p.close) : [];
      const currentPrice = priceHistory.ok ? priceHistory.data.spot ?? points[points.length - 1] ?? null : null;
      const priceSource = priceHistory.ok ? priceHistory.data.source : null;
      const priceCurrency = priceHistory.ok ? priceHistory.data.currency : null;

      if (currentPrice != null && row.entryPrice != null) {
        const pct = entryWindowPct(currentPrice, row.entryPrice);
        if (pct != null) {
          hits.push({
            rule: "entry_window",
            detail: {
              currentPrice,
              entryPrice: row.entryPrice,
              deviationPct: Math.round(pct * 100) / 100,
            },
          });
        }
      }

      const rsi14 = rsi(points, 14);
      if (rsi14 != null && rsi14 < RSI_THRESHOLD) {
        hits.push({
          rule: "rsi_oversold",
          detail: { rsi14: Math.round(rsi14 * 100) / 100, threshold: RSI_THRESHOLD },
        });
      }

      const subClass = row.subClass as SubClass | null;
      if (subClass) {
        const parent = SUB_TO_PARENT[subClass];
        if (parent && underweightedParents.has(parent)) {
          hits.push({
            rule: "sub_underweight",
            detail: { subClass, parentClass: parent, threshold: UNDERWEIGHT_THRESHOLD_PP },
          });
        }
      }

      const dossier = parseDossier(row.dossierJson);
      const catalyst = nearestUpcomingCatalyst(dossier?.upcoming_catalysts, ctx.now);
      if (catalyst) {
        hits.push({
          rule: "catalyst_near",
          detail: {
            event: catalyst.catalyst.event,
            dateEstimate: catalyst.catalyst.date_estimate,
            daysUntil: catalyst.daysUntil,
          },
        });
      }

      const severity = severityFromHits(hits.length);
      if (!severity) {
        // Coingecko free tier rate-limit: espera entre tickers crypto.
        if (resolveTicker(row.ticker).source === "coingecko") {
          await new Promise((r) => setTimeout(r, 300));
        }
        continue;
      }

      const ruleNames = hits.map((h) => ruleLabel(h.rule));
      const title = hits.length >= 2
        ? `${row.ticker}: ${hits.length} señales alineadas`
        : `${row.ticker}: ${ruleLabel(hits[0].rule)}`;
      const summary = `${row.ticker} (${row.subClass ?? "?"}) — ${ruleNames.join(", ")}. Revisa tesis en /intel/research/${row.id}.`;

      signals.push({
        dedupKey: dedupKey("opportunity", row.ticker, windowKey),
        scope: "opportunity",
        asset: row.ticker,
        assetClass: row.subClass ? SUB_TO_PARENT[row.subClass as SubClass] : null,
        severity,
        title,
        summary,
        payload: {
          trackedId: row.id,
          ticker: row.ticker,
          name: row.name,
          subClass: row.subClass,
          status: row.status,
          hits,
          currentPrice,
          priceSource,
          priceCurrency,
          entryPrice: row.entryPrice,
          targetPrice: row.targetPrice,
          stopPrice: row.stopPrice,
          entryPlan: row.entryPlan,
          thesis: row.thesis,
          timeHorizonMonths: row.timeHorizonMonths,
          weekKey: windowKey,
        },
        suggestedAction: "review",
      });

      if (priceHistory.ok && priceHistory.data.source === "coingecko") {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    return signals;
  },
};

export const __internal = {
  parseCatalystDate,
  entryWindowPct,
  nearestUpcomingCatalyst,
  severityFromHits,
  RSI_THRESHOLD,
  ENTRY_WINDOW_PCT,
  UNDERWEIGHT_THRESHOLD_PP,
  CATALYST_HORIZON_DAYS,
};
