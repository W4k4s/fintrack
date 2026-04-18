import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/intel/:id — marcar estado usuario:
 *   { userStatus: "read" | "acted" | "dismissed" | "snoozed", snoozeUntil?: string }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed = ["unread", "read", "acted", "dismissed", "snoozed"];
  if (!allowed.includes(body.userStatus)) {
    return NextResponse.json({ error: "invalid userStatus" }, { status: 400 });
  }

  const patch: Record<string, string | null> = { userStatus: body.userStatus };
  if (body.userStatus === "snoozed") {
    if (!body.snoozeUntil) {
      return NextResponse.json({ error: "snoozeUntil required" }, { status: 400 });
    }
    patch.snoozeUntil = String(body.snoozeUntil);
  } else {
    patch.snoozeUntil = null;
  }

  await db
    .update(schema.intelSignals)
    .set(patch)
    .where(eq(schema.intelSignals.id, id));

  const [row] = await db
    .select()
    .from(schema.intelSignals)
    .where(eq(schema.intelSignals.id, id))
    .limit(1);

  return NextResponse.json({ signal: row });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const [row] = await db
    .select()
    .from(schema.intelSignals)
    .where(eq(schema.intelSignals.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const notifications = await db
    .select()
    .from(schema.intelNotifications)
    .where(eq(schema.intelNotifications.signalId, id));

  return NextResponse.json({
    signal: { ...row, payload: safeParse(row.payload) },
    notifications,
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
