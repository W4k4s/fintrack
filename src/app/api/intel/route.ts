import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, desc, eq, inArray, ne, notInArray, or } from "drizzle-orm";

// Scopes that are purely informational — low severity in these is "ruido".
// Keep in sync with src/app/intel/page.tsx.
const NOISE_SCOPES = ["news", "macro_event"] as const;

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

  // Split unread into actionable and noise. "Noise" = severity=low in purely
  // informational scopes (news, macro_event). Low-severity signals in
  // actionable scopes (dca_pending, drift, rebalance, …) keep implicit action,
  // so they stay in the actionable bucket. `unreadCount` drives the top-bar
  // badge; `noiseCount` exposes the other pile for the "Ruido" tab.
  const actionable = await db
    .select({ id: schema.intelSignals.id })
    .from(schema.intelSignals)
    .where(
      and(
        eq(schema.intelSignals.userStatus, "unread"),
        or(
          notInArray(schema.intelSignals.scope, NOISE_SCOPES),
          ne(schema.intelSignals.severity, "low"),
        ),
      ),
    );
  const noise = await db
    .select({ id: schema.intelSignals.id })
    .from(schema.intelSignals)
    .where(
      and(
        eq(schema.intelSignals.userStatus, "unread"),
        eq(schema.intelSignals.severity, "low"),
        inArray(schema.intelSignals.scope, NOISE_SCOPES),
      ),
    );

  return NextResponse.json({
    signals: parsed,
    unreadCount: actionable.length,
    noiseCount: noise.length,
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
