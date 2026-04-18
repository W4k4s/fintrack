import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ParsedItem } from "./parser";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
];

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const p of TRACKING_PARAMS) url.searchParams.delete(p);
    url.hostname = url.hostname.toLowerCase();
    let path = url.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    url.pathname = path;
    url.hash = "";
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export function externalIdFor(item: ParsedItem, source: string): string {
  const url = normalizeUrl(item.link || "");
  const basis = url || `${source}:${(item.title || "").toLowerCase()}:${item.pubDate ?? ""}`;
  return createHash("sha1").update(basis).digest("hex");
}

export interface PersistedNews {
  id: number;
  externalId: string;
}

export interface PersistNewsResult {
  inserted: PersistedNews[];
  skipped: number;
}

export async function persistNewsItems(
  source: string,
  items: ParsedItem[],
): Promise<PersistNewsResult> {
  const inserted: PersistedNews[] = [];
  let skipped = 0;

  for (const item of items) {
    if (!item.title || !item.link) {
      skipped++;
      continue;
    }
    const externalId = externalIdFor(item, source);
    const url = normalizeUrl(item.link);
    const publishedAt = item.pubDate ?? new Date().toISOString();

    try {
      const existing = await db
        .select({ id: schema.intelNewsItems.id })
        .from(schema.intelNewsItems)
        .where(eq(schema.intelNewsItems.externalId, externalId))
        .limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const rows = await db
        .insert(schema.intelNewsItems)
        .values({
          source,
          externalId,
          url,
          title: item.title,
          publishedAt,
          body: item.description ?? null,
        })
        .returning({ id: schema.intelNewsItems.id });
      if (rows[0]) inserted.push({ id: rows[0].id, externalId });
    } catch (err) {
      console.error("[intel-news] persist failed", source, externalId, err);
      skipped++;
    }
  }

  return { inserted, skipped };
}
