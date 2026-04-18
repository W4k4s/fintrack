import type { MacroFeed } from "./feeds";
import { parseMacroFeed, type MacroEvent } from "./parser";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "FinTrack-Intel/1.0 (personal use)";

export interface MacroFetchResult {
  source: string;
  events: MacroEvent[];
  error?: string;
}

export async function fetchMacroFeed(feed: MacroFeed): Promise<MacroFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { source: feed.source, events: [], error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    return { source: feed.source, events: parseMacroFeed(xml) };
  } catch (err) {
    return {
      source: feed.source,
      events: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
