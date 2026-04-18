import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * GET /api/intel/news — tabla de noticias procesadas.
 *   ?source=ecb,fed,...     (multiselect por fuente)
 *   ?score_min=60           (mínimo rawScore)
 *   ?only_with_signal=true  (solo las que generaron signal)
 *   ?days=7                 (ventana, default 7)
 *   ?limit=100 &offset=0
 */
export async function GET(req: NextRequest) {
  const qp = req.nextUrl.searchParams;
  const sources = qp.get("source")?.split(",").filter(Boolean);
  const scoreMin = qp.get("score_min") ? Number(qp.get("score_min")) : null;
  const onlyWithSignal = qp.get("only_with_signal") === "true";
  const days = Math.min(90, Math.max(1, Number(qp.get("days") || 7)));
  const limit = Math.min(500, Math.max(1, Number(qp.get("limit") || 100)));
  const offset = Math.max(0, Number(qp.get("offset") || 0));

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const conditions = [gte(schema.intelNewsItems.publishedAt, cutoff)];
  if (sources && sources.length > 0) {
    conditions.push(inArray(schema.intelNewsItems.source, sources));
  }
  if (scoreMin != null && Number.isFinite(scoreMin)) {
    conditions.push(gte(schema.intelNewsItems.rawScore, scoreMin));
  }
  if (onlyWithSignal) {
    conditions.push(isNotNull(schema.intelNewsItems.signalId));
  }
  const whereExpr = and(...conditions);

  const rows = await db
    .select({
      id: schema.intelNewsItems.id,
      source: schema.intelNewsItems.source,
      url: schema.intelNewsItems.url,
      title: schema.intelNewsItems.title,
      publishedAt: schema.intelNewsItems.publishedAt,
      rawScore: schema.intelNewsItems.rawScore,
      assetsMentioned: schema.intelNewsItems.assetsMentioned,
      signalId: schema.intelNewsItems.signalId,
      signalSeverity: schema.intelSignals.severity,
      signalStatus: schema.intelSignals.analysisStatus,
    })
    .from(schema.intelNewsItems)
    .leftJoin(schema.intelSignals, eq(schema.intelNewsItems.signalId, schema.intelSignals.id))
    .where(whereExpr)
    .orderBy(desc(schema.intelNewsItems.publishedAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.intelNewsItems)
    .where(whereExpr);

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      assetsMentioned: safeParseArray(r.assetsMentioned),
    })),
    total: Number(total),
    limit,
    offset,
  });
}

function safeParseArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
