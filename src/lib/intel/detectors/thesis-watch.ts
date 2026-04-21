import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { fetchSpotPrice, resolveTicker } from "../research/fetcher";
import { SUB_TO_PARENT, type SubClass } from "../allocation/sub-targets";
import { dedupKey, dayWindowKey, weekWindowKey } from "../dedup";
import type { Detector, DetectorContext, DetectorSignal, Severity, IntelScope } from "../types";

// Strategy V2 Fase 4 — exit-rule watcher.
//
// Vigila posiciones con tesis abierta (status = "open_position" en
// intel_assets_tracked) y emite signals cuando se cruza un nivel de la tesis.
// Stops son SOFT por defecto (CLAUDE.md): emitimos signal, no orden broker.
//
// Un tick puede emitir múltiples signals para el mismo ticker si varias reglas
// concurren (ej. `thesis_near_stop` + `thesis_expired`). Cada sub-scope tiene
// dedup propio; el usuario decide desde el panel.
//
// Prioridad semántica: stop_hit domina a near_stop (si el precio ya está BAJO
// el stop, no emitimos near_stop — sería ruido sobre la misma situación).

const NEAR_STOP_PCT = 5; // alerta cuando current está hasta +5% por encima del stop

type ThesisScope =
  | "thesis_target_hit"
  | "thesis_stop_hit"
  | "thesis_near_stop"
  | "thesis_expired";

export interface ThesisRuleHit {
  scope: ThesisScope;
  severity: Severity;
  detail: Record<string, unknown>;
}

/**
 * Evalúa las 4 reglas sobre una posición con tesis. Pura: no hace I/O.
 * `now` y `currentPrice` vienen del caller; si alguno no está, la regla
 * correspondiente se omite silenciosamente.
 */
export function evalThesisRules(input: {
  now: Date;
  currentPrice: number | null;
  entryDate: string | null;
  timeHorizonMonths: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
}): ThesisRuleHit[] {
  const { now, currentPrice, entryDate, timeHorizonMonths, targetPrice, stopPrice } = input;
  const hits: ThesisRuleHit[] = [];

  // stop vs near_stop son mutuamente excluyentes; evaluamos stop primero.
  let stopTriggered = false;
  if (currentPrice != null && stopPrice != null && stopPrice > 0) {
    if (currentPrice <= stopPrice) {
      stopTriggered = true;
      hits.push({
        scope: "thesis_stop_hit",
        severity: "critical",
        detail: {
          currentPrice,
          stopPrice,
          breachPct: Math.round(((currentPrice - stopPrice) / stopPrice) * 10000) / 100,
        },
      });
    }
  }

  if (
    !stopTriggered &&
    currentPrice != null &&
    stopPrice != null &&
    stopPrice > 0 &&
    currentPrice <= stopPrice * (1 + NEAR_STOP_PCT / 100)
  ) {
    hits.push({
      scope: "thesis_near_stop",
      severity: "med",
      detail: {
        currentPrice,
        stopPrice,
        cushionPct: Math.round(((currentPrice - stopPrice) / stopPrice) * 10000) / 100,
        thresholdPct: NEAR_STOP_PCT,
      },
    });
  }

  if (currentPrice != null && targetPrice != null && targetPrice > 0 && currentPrice >= targetPrice) {
    hits.push({
      scope: "thesis_target_hit",
      severity: "high",
      detail: {
        currentPrice,
        targetPrice,
        overshootPct: Math.round(((currentPrice - targetPrice) / targetPrice) * 10000) / 100,
      },
    });
  }

  if (entryDate && timeHorizonMonths != null && timeHorizonMonths > 0) {
    const entry = new Date(entryDate);
    if (!Number.isNaN(entry.getTime())) {
      const deadline = addMonthsUTC(entry, timeHorizonMonths);
      if (now.getTime() >= deadline.getTime()) {
        const daysOver = Math.floor((now.getTime() - deadline.getTime()) / 86400_000);
        hits.push({
          scope: "thesis_expired",
          severity: "med",
          detail: {
            entryDate,
            timeHorizonMonths,
            deadline: deadline.toISOString().slice(0, 10),
            daysOverdue: daysOver,
          },
        });
      }
    }
  }

  return hits;
}

/**
 * Suma meses en UTC sin efectos locales. Usado para calcular el deadline
 * del horizonte temporal de la tesis.
 */
export function addMonthsUTC(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const result = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  result.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  return result;
}

function windowKeyForScope(scope: ThesisScope, now: Date): string {
  // expired es una condición persistente — sin weekly dedup sería spam diario.
  // Las demás reglas (stop/target/near_stop) son eventos potencialmente
  // volátiles que quiero re-alertar si desaparecen y vuelven.
  return scope === "thesis_expired" ? weekWindowKey(now) : dayWindowKey(now);
}

function titleForHit(ticker: string, hit: ThesisRuleHit): string {
  switch (hit.scope) {
    case "thesis_stop_hit":
      return `${ticker}: STOP pinchado (SOFT)`;
    case "thesis_near_stop":
      return `${ticker}: cerca del stop`;
    case "thesis_target_hit":
      return `${ticker}: target alcanzado`;
    case "thesis_expired":
      return `${ticker}: tesis vencida`;
  }
}

function summaryForHit(ticker: string, trackedId: number, hit: ThesisRuleHit): string {
  const d = hit.detail;
  switch (hit.scope) {
    case "thesis_stop_hit":
      return `${ticker} ${d.currentPrice} ≤ stop ${d.stopPrice} (${d.breachPct}%). SOFT: signal, no orden broker. Revisa tesis en /intel/research/${trackedId}.`;
    case "thesis_near_stop":
      return `${ticker} ${d.currentPrice} a ${d.cushionPct}% del stop ${d.stopPrice} (umbral +${d.thresholdPct}%). Early warning. /intel/research/${trackedId}.`;
    case "thesis_target_hit":
      return `${ticker} ${d.currentPrice} ≥ target ${d.targetPrice} (+${d.overshootPct}%). Decide: parcial, reescribir tesis o cerrar. /intel/research/${trackedId}.`;
    case "thesis_expired":
      return `${ticker} superó horizon ${d.timeHorizonMonths}m desde ${d.entryDate} (deadline ${d.deadline}, ${d.daysOverdue}d de retraso). Revisar vs cerrar. /intel/research/${trackedId}.`;
  }
}

export const thesisWatchDetector: Detector = {
  // El detector engloba los 4 sub-scopes thesis_*; declaramos el más crítico
  // como "scope" para el registro. detectorsForScope() filtra por igualdad
  // estricta, así que para lanzar manualmente usar scope=all o añadir un
  // filtrado especial en la UI si hace falta.
  scope: "thesis_stop_hit",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const openPositions = await db
      .select()
      .from(schema.intelAssetsTracked)
      .where(eq(schema.intelAssetsTracked.status, "open_position"));

    if (openPositions.length === 0) return [];

    const signals: DetectorSignal[] = [];

    for (const row of openPositions) {
      const spot = await fetchSpotPrice(row.ticker);
      const currentPrice = spot.ok ? spot.data.price : null;
      const priceSource = spot.ok ? spot.data.source : null;
      const priceCurrency = spot.ok ? spot.data.currency : null;

      const hits = evalThesisRules({
        now: ctx.now,
        currentPrice,
        entryDate: row.entryDate,
        timeHorizonMonths: row.timeHorizonMonths,
        targetPrice: row.targetPrice,
        stopPrice: row.stopPrice,
      });

      for (const hit of hits) {
        const windowKey = windowKeyForScope(hit.scope, ctx.now);
        const parent = row.subClass ? SUB_TO_PARENT[row.subClass as SubClass] : null;
        signals.push({
          dedupKey: dedupKey(hit.scope, row.ticker, windowKey),
          scope: hit.scope as IntelScope,
          asset: row.ticker,
          assetClass: parent,
          severity: hit.severity,
          title: titleForHit(row.ticker, hit),
          summary: summaryForHit(row.ticker, row.id, hit),
          payload: {
            trackedId: row.id,
            ticker: row.ticker,
            name: row.name,
            subClass: row.subClass,
            currentPrice,
            priceSource,
            priceCurrency,
            entryPrice: row.entryPrice,
            entryDate: row.entryDate,
            targetPrice: row.targetPrice,
            stopPrice: row.stopPrice,
            timeHorizonMonths: row.timeHorizonMonths,
            thesis: row.thesis,
            entryPlan: row.entryPlan,
            hit: hit.detail,
            windowKey,
          },
          suggestedAction:
            hit.scope === "thesis_stop_hit"
              ? "sell_partial"
              : hit.scope === "thesis_target_hit"
              ? "sell_partial"
              : "review",
        });
      }

      if (resolveTicker(row.ticker).source === "coingecko") {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    return signals;
  },
};

export const __internal = {
  evalThesisRules,
  addMonthsUTC,
  windowKeyForScope,
  titleForHit,
  summaryForHit,
  NEAR_STOP_PCT,
};
