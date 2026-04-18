import type { NewsFeed } from "./feeds";
import { parseFeed, type ParsedItem } from "./parser";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "FinTrack-Intel/1.0 (personal use)";

// In-memory ETag cache per feed URL. Reset on server restart (acceptable).
const etagCache = new Map<string, { etag?: string; lastModified?: string }>();

export interface FetchResult {
  source: string;
  tier: NewsFeed["tier"];
  items: ParsedItem[];
  notModified: boolean;
  error?: string;
}

export async function fetchFeed(feed: NewsFeed): Promise<FetchResult> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  const cached = etagCache.get(feed.url);
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(feed.url, { headers, signal: controller.signal });
    if (res.status === 304) {
      return { source: feed.source, tier: feed.tier, items: [], notModified: true };
    }
    if (!res.ok) {
      return {
        source: feed.source,
        tier: feed.tier,
        items: [],
        notModified: false,
        error: `HTTP ${res.status}`,
      };
    }

    const etag = res.headers.get("etag") ?? undefined;
    const lastModified = res.headers.get("last-modified") ?? undefined;
    if (etag || lastModified) etagCache.set(feed.url, { etag, lastModified });

    const xml = await res.text();
    const items = parseFeed(xml);
    return { source: feed.source, tier: feed.tier, items, notModified: false };
  } catch (err) {
    return {
      source: feed.source,
      tier: feed.tier,
      items: [],
      notModified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllFeeds(feeds: readonly NewsFeed[]): Promise<FetchResult[]> {
  return Promise.all(feeds.map(fetchFeed));
}
