import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { FEEDS } from "@/lib/intel/news/feeds";
import { fetchAllFeeds } from "@/lib/intel/news/fetcher";
import { persistNewsItems } from "@/lib/intel/news/persist-news";
import { buildAliases, scoreArticle } from "@/lib/intel/news/score";

/**
 * POST /api/intel/news/debug-fetch
 *
 * Endpoint temporal de Sprint 2.1: fetchea todos los feeds, persiste items
 * nuevos y devuelve un resumen por fuente. No crea signals ni spawnea Claude.
 * Se puede borrar cuando Sprint 2.3 integre el detector en /api/intel/tick.
 */
export async function POST() {
  const started = Date.now();
  const results = await fetchAllFeeds(FEEDS);
  const now = new Date();

  const plans = await db.select().from(schema.investmentPlans);
  const assetList = plans.filter((p) => p.enabled).map((p) => p.asset);
  const aliases = buildAliases(assetList);

  const summary: Array<{
    source: string;
    tier: number;
    parsed: number;
    inserted: number;
    skipped: number;
    notModified: boolean;
    error?: string;
    scored?: { min: number; max: number; avg: number; passed60: number };
    top?: Array<{
      title: string;
      score: number;
      breakdown: ReturnType<typeof scoreArticle>["breakdown"];
      assets: string[];
      keywords: string[];
    }>;
  }> = [];

  const distributionBuckets = { lt30: 0, "30-50": 0, "50-60": 0, "60-80": 0, gte80: 0 };

  for (const r of results) {
    if (r.error) {
      summary.push({
        source: r.source,
        tier: r.tier,
        parsed: 0,
        inserted: 0,
        skipped: 0,
        notModified: r.notModified,
        error: r.error,
      });
      continue;
    }

    const { inserted, skipped } = await persistNewsItems(r.source, r.items);

    const scored = r.items.map((it) => ({
      item: it,
      ...scoreArticle(it, r.tier, aliases, now),
    }));

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let passed = 0;
    for (const s of scored) {
      min = Math.min(min, s.score);
      max = Math.max(max, s.score);
      sum += s.score;
      if (s.score >= 60) passed++;
      if (s.score < 30) distributionBuckets.lt30++;
      else if (s.score < 50) distributionBuckets["30-50"]++;
      else if (s.score < 60) distributionBuckets["50-60"]++;
      else if (s.score < 80) distributionBuckets["60-80"]++;
      else distributionBuckets.gte80++;
    }

    const top = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => ({
        title: s.item.title,
        score: s.score,
        breakdown: s.breakdown,
        assets: s.assetsMentioned,
        keywords: s.keywordsMatched,
      }));

    summary.push({
      source: r.source,
      tier: r.tier,
      parsed: r.items.length,
      inserted: inserted.length,
      skipped,
      notModified: r.notModified,
      scored: scored.length
        ? { min, max, avg: Math.round((sum / scored.length) * 10) / 10, passed60: passed }
        : undefined,
      top,
    });
  }

  return NextResponse.json({
    durationMs: Date.now() - started,
    portfolioAssets: assetList,
    distribution: distributionBuckets,
    feeds: summary,
  });
}
