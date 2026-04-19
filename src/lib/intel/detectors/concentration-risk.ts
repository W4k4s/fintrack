import { db, schema } from "@/lib/db";
import { getEurPerUsd } from "@/lib/currency-rates";
import { getExchangeInfo } from "@/lib/exchanges/registry";
import { classifyAsset } from "../allocation/classify";
import { dedupKey, weekWindowKey } from "../dedup";
import {
  aggregatePositions,
  computeConcentration,
  evaluateConcentration,
  hhiLabel,
  hitsToSeverity,
  CONCENTRATION_THRESHOLDS,
  type PositionValue,
} from "../concentration";
import type { Detector, DetectorContext, DetectorSignal } from "../types";

export const concentrationRiskDetector: Detector = {
  scope: "concentration_risk",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const [assets, accounts, exchanges] = await Promise.all([
      db.select().from(schema.assets),
      db.select().from(schema.accounts),
      db.select().from(schema.exchanges),
    ]);

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const exchangeMap = new Map(exchanges.map((e) => [e.id, e]));
    const eurPerUsd = await getEurPerUsd();

    const raw: PositionValue[] = [];
    for (const asset of assets) {
      if (!asset.amount || asset.amount <= 0) continue;
      if (!asset.currentPrice) continue;
      const account = accountMap.get(asset.accountId);
      const exchange = account ? exchangeMap.get(account.exchangeId) : null;
      const info = exchange ? getExchangeInfo(exchange.slug) : null;

      // Excluimos bank cash y símbolos clasificados como cash — concentración
      // solo aplica al portfolio de riesgo.
      if (info?.category === "bank") continue;
      const cls = classifyAsset(asset.symbol);
      if (cls === "cash") continue;

      const valueEur = asset.amount * asset.currentPrice * eurPerUsd;
      if (valueEur <= 0) continue;
      raw.push({ symbol: asset.symbol, assetClass: cls, valueEur });
    }

    // Agregamos por symbol (no por venue): concentration es global, cross-venue.
    const byKey = new Map<string, PositionValue>();
    for (const p of raw) {
      const acc = byKey.get(p.symbol);
      if (acc) acc.valueEur += p.valueEur;
      else byKey.set(p.symbol, { ...p });
    }
    const aggregated = aggregatePositions([...byKey.values()]);

    const snap = computeConcentration(aggregated);
    const hits = evaluateConcentration(snap);
    if (hits.length === 0) return [];
    const severity = hitsToSeverity(hits);
    if (!severity) return [];

    const top1 = snap.topPosition;
    const excessEurMax = Math.max(...hits.map((h) => h.excessEur));
    const weekKey = weekWindowKey(ctx.now);
    // Dedup 1/semana por perfil. topSymbol entra en la clave para evitar que un cambio de líder oculte una
    // nueva señal en la misma semana (si pasa de BTC a MSCI con concentración alta, quiero 2 signals).
    const topSymbol = top1?.symbol ?? "agg";
    const dedup = dedupKey("concentration_risk", topSymbol, weekKey);

    const top5Pretty = snap.positions
      .slice(0, 5)
      .map((p) => `${p.symbol} ${p.pct.toFixed(1)}%`)
      .join(", ");
    const topLine = hits.find((h) => h.kind === "top1");
    const top3Line = hits.find((h) => h.kind === "top3");
    const summaryParts: string[] = [];
    if (topLine) {
      summaryParts.push(
        `${top1?.symbol ?? "top1"} ${topLine.pct.toFixed(1)}% del portfolio de riesgo (umbral ${topLine.threshold}%, exceso ${Math.round(topLine.excessEur)}€)`,
      );
    }
    if (top3Line) {
      summaryParts.push(
        `Top-3 ${top3Line.pct.toFixed(1)}% (umbral ${top3Line.threshold}%, exceso ${Math.round(top3Line.excessEur)}€)`,
      );
    }
    summaryParts.push(`HHI ${Math.round(snap.hhi)} (${hhiLabel(snap.hhi)})`);
    summaryParts.push(`Top-5: ${top5Pretty}`);

    const title =
      topLine && topLine.severity !== "med"
        ? `Concentración alta: ${top1?.symbol ?? ""} ${topLine.pct.toFixed(0)}%`
        : `Concentración alta: top-3 ${snap.topShare.n3.toFixed(0)}%`;

    return [
      {
        dedupKey: dedup,
        scope: "concentration_risk",
        asset: top1?.symbol ?? null,
        assetClass: top1?.assetClass ?? null,
        severity,
        title,
        summary: summaryParts.join(". "),
        payload: {
          netWorthRiskEur: Math.round(snap.netWorthEur),
          topPosition: top1
            ? {
                symbol: top1.symbol,
                assetClass: top1.assetClass,
                valueEur: Math.round(top1.valueEur),
                pct: Math.round(top1.pct * 10) / 10,
              }
            : null,
          topShare: {
            n1: Math.round(snap.topShare.n1 * 10) / 10,
            n3: Math.round(snap.topShare.n3 * 10) / 10,
            n5: Math.round(snap.topShare.n5 * 10) / 10,
          },
          positions: snap.positions.slice(0, 8).map((p) => ({
            symbol: p.symbol,
            assetClass: p.assetClass,
            valueEur: Math.round(p.valueEur),
            pct: Math.round(p.pct * 10) / 10,
          })),
          hhi: Math.round(snap.hhi),
          hhiLabel: hhiLabel(snap.hhi),
          hits,
          thresholds: CONCENTRATION_THRESHOLDS,
          weekKey,
        },
        suggestedAction: "sell_partial",
        actionAmountEur: Math.round(excessEurMax),
      },
    ];
  },
};
