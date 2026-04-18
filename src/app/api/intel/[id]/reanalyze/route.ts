import { NextRequest, NextResponse } from "next/server";
import { spawnClaudeForSignal } from "@/lib/intel/claude-spawn";

/**
 * POST /api/intel/:id/reanalyze — re-lanza el agente Claude para esta signal.
 * Útil para debug, recuperación tras fallo, o análisis manual.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // fire-and-forget; devolvemos inmediato
  void spawnClaudeForSignal(id).catch((e) =>
    console.error(`[intel] reanalyze fail signal=${id}`, e),
  );

  return NextResponse.json({ queued: true, id });
}
