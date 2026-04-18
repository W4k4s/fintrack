import { NextResponse } from "next/server";
import { FEEDS } from "@/lib/intel/news/feeds";
import { fetchAllFeeds } from "@/lib/intel/news/fetcher";
import { persistNewsItems } from "@/lib/intel/news/persist-news";

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

  const summary: Array<{
    source: string;
    tier: number;
    parsed: number;
    inserted: number;
    skipped: number;
    notModified: boolean;
    error?: string;
    sample?: Array<{ id: number; title: string; url: string; publishedAt: string }>;
  }> = [];

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
    summary.push({
      source: r.source,
      tier: r.tier,
      parsed: r.items.length,
      inserted: inserted.length,
      skipped,
      notModified: r.notModified,
      sample: r.items.slice(0, 3).map((it) => ({
        id: 0,
        title: it.title,
        url: it.link,
        publishedAt: it.pubDate ?? "",
      })),
    });
  }

  return NextResponse.json({
    durationMs: Date.now() - started,
    feeds: summary,
  });
}
