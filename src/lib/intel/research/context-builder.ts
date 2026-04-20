/**
 * Monta el bloque MARKET_DATA que se pega al final del prompt antes de llamar
 * a Claude. Fuente: fetcher + indicators + último allocation snapshot.
 * Sin correlación-vs-holdings ni news-lookup aún — sesión 4.
 */

import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { fetchPriceHistory, type PriceHistory } from "./fetcher";
import { computeTechnicalSnapshot, type TechnicalSnapshot } from "./indicators";

export interface ResearchContext {
  ticker: string;
  priceHistory: PriceHistory | null;
  technical: TechnicalSnapshot | null;
  portfolioSnapshot: {
    date: string;
    netWorthEur: number;
    allocation: Record<string, { actualPct: number; targetPct: number; driftPp: number }>;
  } | null;
  fetchErrors: string[];
}

export async function buildResearchContext(ticker: string): Promise<ResearchContext> {
  const errors: string[] = [];
  const hist = await fetchPriceHistory(ticker, 1100);
  const priceHistory = hist.ok ? hist.data : null;
  if (!hist.ok) errors.push(`price_history: ${hist.reason}`);

  const technical = priceHistory
    ? computeTechnicalSnapshot(priceHistory.points.map((p) => p.close))
    : null;

  const [snap] = await db
    .select()
    .from(schema.intelAllocationSnapshots)
    .orderBy(desc(schema.intelAllocationSnapshots.date))
    .limit(1);
  let portfolioSnapshot: ResearchContext["portfolioSnapshot"] = null;
  if (snap) {
    try {
      portfolioSnapshot = {
        date: snap.date,
        netWorthEur: snap.netWorthEur,
        allocation: JSON.parse(snap.allocation),
      };
    } catch {
      errors.push("portfolio_snapshot: allocation JSON unparseable");
    }
  } else {
    errors.push("portfolio_snapshot: no snapshot yet");
  }

  return { ticker, priceHistory, technical, portfolioSnapshot, fetchErrors: errors };
}

/**
 * Formatea el contexto como un bloque de texto para añadir al prompt.
 * El prompt indica que los datos llegan en "MARKET_DATA" — se respeta ese label.
 */
export function formatMarketData(ctx: ResearchContext): string {
  const lines: string[] = ["MARKET_DATA:"];
  lines.push(`ticker: ${ctx.ticker}`);

  if (ctx.priceHistory) {
    const ph = ctx.priceHistory;
    const closes = ph.points.map((p) => p.close);
    const firstTs = ph.points[0]?.ts;
    const lastTs = ph.points[ph.points.length - 1]?.ts;
    lines.push(
      `price_source: ${ph.source}`,
      `currency: ${ph.currency}`,
      `spot_price: ${ph.spot ?? "null"}`,
      `history_bars: ${closes.length}`,
      `history_range: ${firstTs ? new Date(firstTs * 1000).toISOString().slice(0, 10) : "?"} → ${lastTs ? new Date(lastTs * 1000).toISOString().slice(0, 10) : "?"}`,
    );
    // Muestra 12 precios uniformemente espaciados para no inundar contexto.
    const sample: string[] = [];
    const step = Math.max(1, Math.floor(closes.length / 12));
    for (let i = 0; i < closes.length; i += step) {
      sample.push(
        `${new Date(ph.points[i].ts * 1000).toISOString().slice(0, 10)}=${closes[i].toFixed(4)}`,
      );
    }
    lines.push(`history_sample: ${sample.join(", ")}`);
  } else {
    lines.push("price_source: unavailable");
  }

  if (ctx.technical) {
    const t = ctx.technical;
    lines.push(
      "",
      "technical_snapshot:",
      `  price: ${t.price?.toFixed(4) ?? "null"}`,
      `  sma50: ${t.sma50?.toFixed(4) ?? "null"}`,
      `  sma200: ${t.sma200?.toFixed(4) ?? "null"}`,
      `  dist_to_sma200_pct: ${t.distToSma200Pct?.toFixed(2) ?? "null"}`,
      `  rsi14: ${t.rsi14?.toFixed(2) ?? "null"}`,
      `  macd: ${t.macd ? `macd=${t.macd.macd.toFixed(4)} signal=${t.macd.signal.toFixed(4)} hist=${t.macd.hist.toFixed(4)}` : "null"}`,
      `  bollinger_pct_b: ${t.bollingerPctB?.toFixed(3) ?? "null"}`,
      `  vol_90d_pct: ${t.vol90dPct?.toFixed(2) ?? "null"}`,
    );
  }

  lines.push("", "portfolio_snapshot:");
  if (ctx.portfolioSnapshot) {
    const p = ctx.portfolioSnapshot;
    lines.push(`  as_of: ${p.date}`);
    lines.push(`  net_worth_eur: ${p.netWorthEur.toFixed(2)}`);
    for (const [cls, d] of Object.entries(p.allocation)) {
      lines.push(`  ${cls}: actual=${d.actualPct}% target=${d.targetPct}% drift=${d.driftPp.toFixed(2)}pp`);
    }
  } else {
    lines.push("  unavailable");
  }

  lines.push(
    "",
    "correlation_vs_top_holdings: unavailable (Fase 0.4 TODO)",
    "news_last_7d: unavailable (Fase 0.4 TODO)",
    "fundamentals: unavailable en este motor (marcar `unknown` donde aplique)",
  );

  if (ctx.fetchErrors.length) {
    lines.push("", `fetch_errors: ${ctx.fetchErrors.join("; ")}`);
  }

  return lines.join("\n");
}
