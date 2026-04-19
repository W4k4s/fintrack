import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/intel/orders/:id — marcado manual de orders desde UI.
 *
 * Body:
 *   { status: "executed" | "dismissed" | "pending",
 *     actualAmountEur?: number,  // solo si executed
 *     actualUnits?: number,
 *     notes?: string }
 *
 * Transiciones permitidas:
 *   pending|needs_pick → executed|dismissed|pending (revertir)
 *   executed|dismissed → pending (revertir error del usuario)
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
    status: body.status,
    updatedAt: nowIso,
  };

  if (body.status === "executed") {
    patch.executedAt = nowIso;
    if (typeof body.actualAmountEur === "number" && Number.isFinite(body.actualAmountEur)) {
      patch.actualAmountEur = body.actualAmountEur;
    } else {
      patch.actualAmountEur = existing.amountEur;
    }
    if (typeof body.actualUnits === "number" && Number.isFinite(body.actualUnits)) {
      patch.actualUnits = body.actualUnits;
    }
  } else {
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

  return NextResponse.json({ order: updated });
}
