/**
 * Busca en `intel_news_items` menciones recientes del ticker investigado.
 * Prioridad: (1) coincidencia en assets_mentioned JSON, (2) LIKE en título,
 * (3) LIKE en body. Dedup por url. Último 7 días por defecto.
 */

import { db, schema } from "@/lib/db";
import { and, desc, gte, like, or } from "drizzle-orm";

export interface NewsHit {
  source: string;
  publishedAt: string;
  title: string;
  url: string;
  matchedBy: "assets_mentioned" | "title" | "body";
}

export async function fetchRecentNewsForTicker(ticker: string, daysBack = 7, limit = 10): Promise<NewsHit[]> {
  const upper = ticker.toUpperCase();
  const cutoff = new Date(Date.now() - daysBack * 86400_000).toISOString();

  // Patrón JSON: "TICKER" entre comillas dentro del array serializado.
  const jsonPattern = `%"${upper}"%`;
  const textPattern = `%${upper}%`;

  const rows = await db
    .select({
      id: schema.intelNewsItems.id,
      source: schema.intelNewsItems.source,
      publishedAt: schema.intelNewsItems.publishedAt,
      title: schema.intelNewsItems.title,
      body: schema.intelNewsItems.body,
      url: schema.intelNewsItems.url,
      assetsMentioned: schema.intelNewsItems.assetsMentioned,
    })
    .from(schema.intelNewsItems)
    .where(
      and(
        gte(schema.intelNewsItems.publishedAt, cutoff),
        or(
          like(schema.intelNewsItems.assetsMentioned, jsonPattern),
          like(schema.intelNewsItems.title, textPattern),
          like(schema.intelNewsItems.body, textPattern),
        ),
      ),
    )
    .orderBy(desc(schema.intelNewsItems.publishedAt))
    .limit(limit * 3); // overshoot, filtramos falsos positivos abajo

  // Filtro secundario: el match en body debe ser palabra razonable (evitar
  // casos como "XLE" matcheando "EXLEADER"). Usamos boundary check laxo.
  const boundary = new RegExp(`(^|[^A-Za-z])${upper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`);
  const seen = new Set<string>();
  const out: NewsHit[] = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    let matchedBy: NewsHit["matchedBy"] | null = null;
    if (r.assetsMentioned && r.assetsMentioned.includes(`"${upper}"`)) matchedBy = "assets_mentioned";
    else if (r.title && boundary.test(r.title)) matchedBy = "title";
    else if (r.body && boundary.test(r.body)) matchedBy = "body";
    if (!matchedBy) continue;
    seen.add(r.url);
    out.push({
      source: r.source,
      publishedAt: r.publishedAt,
      title: r.title,
      url: r.url,
      matchedBy,
    });
    if (out.length >= limit) break;
  }
  return out;
}
