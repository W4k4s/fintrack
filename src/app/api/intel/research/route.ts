import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, inArray } from "drizzle-orm";
import { resolveTicker } from "@/lib/intel/research/fetcher";
import { spawnClaudeForResearch } from "@/lib/intel/research/claude-runner";

/**
 * POST /api/intel/research
 * Body: { ticker: string; note?: string }
 * Crea fila en intel_assets_tracked status=researching y devuelve `{ id }`.
 * El orquestador async (siguiente sesión) rellena dossier_json después.
 *
 * Idempotencia: el unique index parcial por status=researching evita duplicar
 * un research activo del mismo ticker. Si ya existe, devolvemos el existente.
 */
export async function POST(req: NextRequest) {
  let body: { ticker?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim() : "";
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  if (ticker.length > 32) return NextResponse.json({ error: "ticker too long" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

  const resolved = resolveTicker(ticker);
  const assetClassHint = resolved.assetClassHint;
  const normalized = resolved.normalized;

  // Reusar research activo si ya existe para el mismo ticker.
  const existing = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(eq(schema.intelAssetsTracked.ticker, normalized))
    .limit(10);
  const active = existing.find((r) => r.status === "researching");
  if (active) {
    return NextResponse.json({ id: active.id, status: active.status, reused: true });
  }

  const now = new Date().toISOString();
  const ttl30d = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

  const [row] = await db
    .insert(schema.intelAssetsTracked)
    .values({
      ticker: normalized,
      note,
      assetClass: assetClassHint,
      status: "researching",
      requestedAt: now,
      dossierTtlAt: ttl30d,
      priceSource: resolved.source,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.intelAssetsTracked.id });

  // Fire-and-forget: lanzar worker async. En Next dev el proceso sigue vivo
  // después de responder, suficiente para local. No await: el POST retorna ya.
  spawnClaudeForResearch(row.id).catch((e) => {
    console.error(`[research] async spawn crashed for id=${row.id}:`, e);
  });

  return NextResponse.json({ id: row.id, status: "researching", reused: false }, { status: 201 });
}

/**
 * GET /api/intel/research
 * Query: ?status=researching,shortlisted,...  ?limit=50
 * Sin filtros devuelve las 50 últimas de cualquier status excepto archived.
 */
export async function GET(req: NextRequest) {
  const qp = req.nextUrl.searchParams;
  const statusParam = qp.get("status")?.split(",").filter(Boolean);
  const limit = Math.min(200, Number(qp.get("limit") || 50));

  const rows = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(
      statusParam && statusParam.length > 0
        ? inArray(
            schema.intelAssetsTracked.status,
            statusParam as ("researching" | "researched" | "shortlisted" | "watching" | "open_position" | "closed" | "archived" | "failed")[],
          )
        : undefined,
    )
    .orderBy(desc(schema.intelAssetsTracked.updatedAt))
    .limit(limit);

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      ticker: r.ticker,
      name: r.name,
      assetClass: r.assetClass,
      subClass: r.subClass,
      status: r.status,
      verdict: r.verdict,
      note: r.note,
      thesis: r.thesis,
      entryPrice: r.entryPrice,
      targetPrice: r.targetPrice,
      stopPrice: r.stopPrice,
      timeHorizonMonths: r.timeHorizonMonths,
      entryDate: r.entryDate,
      requestedAt: r.requestedAt,
      researchedAt: r.researchedAt,
      updatedAt: r.updatedAt,
    })),
  });
}
