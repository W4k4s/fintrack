import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, desc, eq, inArray } from "drizzle-orm";

/**
 * GET /api/intel — list signals con filtros opcionales:
 *   ?severity=low,med,high,critical
 *   ?scope=<scope>
 *   ?status=unread,read,acted,dismissed,snoozed
 *   ?limit=50
 */
export async function GET(req: NextRequest) {
  const qp = req.nextUrl.searchParams;
  const severity = qp.get("severity")?.split(",").filter(Boolean);
  const scope = qp.get("scope");
  const status = qp.get("status")?.split(",").filter(Boolean);
  const limit = Math.min(200, Number(qp.get("limit") || 50));

  const conditions = [];
  if (severity && severity.length > 0) {
    conditions.push(inArray(schema.intelSignals.severity, severity as ("low" | "med" | "high" | "critical")[]));
  }
  if (scope) {
    conditions.push(eq(schema.intelSignals.scope, scope as typeof schema.intelSignals.scope._.data));
  }
  if (status && status.length > 0) {
    conditions.push(
      inArray(
        schema.intelSignals.userStatus,
        status as ("unread" | "read" | "acted" | "dismissed" | "snoozed")[],
      ),
    );
  }

  const rows = await db
    .select()
    .from(schema.intelSignals)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.intelSignals.createdAt))
    .limit(limit);

  const parsed = rows.map((r) => ({
    ...r,
    payload: safeParse(r.payload),
  }));

  const unreadCount = await db
    .select({ count: schema.intelSignals.id })
    .from(schema.intelSignals)
    .where(eq(schema.intelSignals.userStatus, "unread"));

  return NextResponse.json({
    signals: parsed,
    unreadCount: unreadCount.length,
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
