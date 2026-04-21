import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { dedupKey, dayWindowKey } from "../dedup";
import type { Detector, DetectorContext, DetectorSignal, Severity } from "../types";
import { FEEDS } from "../news/feeds";
import { fetchAllFeeds } from "../news/fetcher";
import { externalIdFor, persistNewsItems } from "../news/persist-news";
import { buildAliases, scoreArticle, type ScoredItem } from "../news/score";
import { collectTrackedAliasAssets } from "../news/tracked-aliases";
import type { ParsedItem } from "../news/parser";

const SIGNAL_THRESHOLD = 60;

function severityForScore(score: number): Severity {
  if (score >= 90) return "critical";
  if (score >= 80) return "high";
  if (score >= 65) return "med";
  return "low";
}

interface CandidateBuild {
  item: ParsedItem;
  source: string;
  tier: number;
  scored: ScoredItem;
  primaryAsset: string | null;
  signalDedup: string;
  newsItemId: number;
}

export const newsFilterDetector: Detector = {
  scope: "news",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const plans = await db.select().from(schema.investmentPlans);
    const enabledAssets = plans.filter((p) => p.enabled).map((p) => p.asset);
    // Strategy V2 Fase 2 — news también surface para activos en research/
    // shortlist/watching/open_position. Research en estado `researching`
    // solo entra con TTL 7d desde requested_at.
    const trackedTickers = await collectTrackedAliasAssets(ctx.now);
    const aliases = buildAliases([...enabledAssets, ...trackedTickers]);

    const fetches = await fetchAllFeeds(FEEDS);
    const windowKey = dayWindowKey(ctx.now);
    const candidates: CandidateBuild[] = [];

    for (const r of fetches) {
      if (r.error || r.notModified) continue;
      const { inserted } = await persistNewsItems(r.source, r.items);
      if (inserted.length === 0) continue;

      const newIdByExternalId = new Map(inserted.map((p) => [p.externalId, p.id]));
      for (const item of r.items) {
        const externalId = externalIdFor(item, r.source);
        const newsItemId = newIdByExternalId.get(externalId);
        if (!newsItemId) continue;

        const scored = scoreArticle(item, r.tier, aliases, ctx.now);
        if (scored.score < SIGNAL_THRESHOLD) continue;

        const primaryAsset = scored.assetsMentioned[0] ?? null;
        const signalDedup = dedupKey(
          "news",
          primaryAsset ?? r.source,
          `${windowKey}:${scored.keywordsMatched[0] ?? "nokw"}`,
        );
        candidates.push({
          item,
          source: r.source,
          tier: r.tier,
          scored,
          primaryAsset,
          signalDedup,
          newsItemId,
        });
      }
    }

    if (candidates.length === 0) return [];
    await enrichNewsItemsScoring(candidates);
    return candidates.map(buildDetectorSignal);
  },
};

function buildDetectorSignal(c: CandidateBuild): DetectorSignal {
  const severity = severityForScore(c.scored.score);
  const excerpt = (c.item.description ?? "").replace(/<[^>]+>/g, " ").trim().slice(0, 500);
  return {
    dedupKey: c.signalDedup,
    scope: "news",
    asset: c.primaryAsset,
    assetClass: c.primaryAsset ? guessAssetClass(c.primaryAsset) : null,
    severity,
    title: truncate(c.item.title, 140),
    summary: excerpt || c.item.title,
    payload: {
      source: c.source,
      publisherTier: c.tier,
      url: c.item.link,
      title: c.item.title,
      publishedAt: c.item.pubDate,
      keywordsMatched: c.scored.keywordsMatched,
      assetsMentioned: c.scored.assetsMentioned,
      rawScore: c.scored.score,
      scoreBreakdown: c.scored.breakdown,
      bodyExcerpt: excerpt,
      newsItemId: c.newsItemId,
    },
    suggestedAction: "review",
  };
}

function guessAssetClass(asset: string): string | null {
  const up = asset.toUpperCase();
  if (["BTC", "ETH", "SOL", "USDC", "USDT"].includes(up)) return "crypto";
  if (up.includes("MSCI") || up.includes("ETF")) return "etfs";
  if (up === "GOLD ETC") return "gold";
  if (up.includes("BOND")) return "bonds";
  return null;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

async function enrichNewsItemsScoring(candidates: CandidateBuild[]): Promise<void> {
  for (const c of candidates) {
    await db
      .update(schema.intelNewsItems)
      .set({
        rawScore: c.scored.score,
        assetsMentioned: JSON.stringify(c.scored.assetsMentioned),
      })
      .where(eq(schema.intelNewsItems.id, c.newsItemId));
  }
}

export async function linkNewsItemsToSignals(
  candidatesPayload: { newsItemId: number; signalId: number }[],
): Promise<void> {
  for (const c of candidatesPayload) {
    await db
      .update(schema.intelNewsItems)
      .set({ signalId: c.signalId })
      .where(eq(schema.intelNewsItems.id, c.newsItemId));
  }
}
