import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { classifyExecution } from "@/lib/intel/rebalance/execution-status";
import { maybeMarkSignalActed } from "@/lib/intel/rebalance/orders";

/**
 * PATCH /api/intel/orders/:id — marcado manual de orders desde UI.
 *
 * Body:
 *   { status: "executed" | "dismissed" | "pending",
 *     actualAmountEur?: number,  // solo si executed
 *     actualUnits?: number,
 *     notes?: string }
 *
 * Si status=executed y actualAmountEur < planned*0.8 → se persiste como
 * `partial` (Fase 8.6). El caller sigue pasando "executed" — el endpoint
 * clasifica la realidad.
 *
 * Tras transicionar, si todas las orders del signal están en estado
 * terminal (executed|partial|dismissed|stale), el signal asociado pasa a
 * userStatus=acted (Fase 8.7).
 *
 * Transiciones permitidas:
 *   pending|needs_pick → executed|partial|dismissed|pending (revertir)
 *   executed|partial|dismissed → pending (revertir error del usuario)
 *   superseded|stale → (bloqueado)
 */
const MANUAL_STATUSES = new Set(["executed", "dismissed", "pending"]);
const TERMINAL = new Set(["superseded", "stale"]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    actualAmountEur?: number;
    actualUnits?: number;
    notes?: string;
  };

  if (!body.status || !MANUAL_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${[...MANUAL_STATUSES].join("|")}` },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(schema.intelRebalanceOrders)
    .where(eq(schema.intelRebalanceOrders.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (TERMINAL.has(existing.status)) {
    return NextResponse.json(
      { error: `cannot modify order in status=${existing.status}` },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, string | number | null> = {
    updatedAt: nowIso,
  };

  if (body.status === "executed") {
    const actualRaw =
      typeof body.actualAmountEur === "number" && Number.isFinite(body.actualAmountEur)
        ? body.actualAmountEur
        : existing.amountEur;
    const realStatus = classifyExecution(actualRaw, existing.amountEur);
    patch.status = realStatus === "dismissed" ? "dismissed" : realStatus;
    patch.executedAt = realStatus === "dismissed" ? null : nowIso;
    patch.actualAmountEur = realStatus === "dismissed" ? null : actualRaw;
    if (typeof body.actualUnits === "number" && Number.isFinite(body.actualUnits)) {
      patch.actualUnits = body.actualUnits;
    }
  } else if (body.status === "dismissed") {
    patch.status = "dismissed";
    patch.executedAt = null;
    patch.actualAmountEur = null;
    patch.actualUnits = null;
  } else {
    // revert to pending
    patch.status = "pending";
    patch.executedAt = null;
    patch.actualAmountEur = null;
    patch.actualUnits = null;
  }

  if (typeof body.notes === "string") {
    patch.notes = body.notes;
  }

  await db
    .update(schema.intelRebalanceOrders)
    .set(patch)
    .where(eq(schema.intelRebalanceOrders.id, id));

  const [updated] = await db
    .select()
    .from(schema.intelRebalanceOrders)
    .where(eq(schema.intelRebalanceOrders.id, id))
    .limit(1);

  // Fase 8.7 — si todas las orders del signal están en estado terminal, marcar acted.
  let signalActed = false;
  try {
    signalActed = await maybeMarkSignalActed(existing.signalId);
  } catch (err) {
    console.error("[orders PATCH] maybeMarkSignalActed failed", err);
  }

  return NextResponse.json({ order: updated, signalActed });
}
