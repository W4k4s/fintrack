import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";

const NOISE_SCOPES = ["news", "macro_event"] as const;

// POST /api/intel/mark-all-read
// Body: { kind?: "actionable" | "noise" | "all" }  (default "actionable")
// Marca como "read" todas las señales unread que caen en ese bucket.
export async function POST(req: NextRequest) {
  let kind: "actionable" | "noise" | "all" = "actionable";
  try {
    const body = await req.json();
    if (body?.kind === "noise" || body?.kind === "all") kind = body.kind;
    else if (body?.kind === "actionable") kind = "actionable";
  } catch {
    /* body opcional */
  }

  const conditions = [eq(schema.intelSignals.userStatus, "unread" as const)];
  if (kind === "actionable") {
    conditions.push(
      or(
        notInArray(schema.intelSignals.scope, [...NOISE_SCOPES]),
        ne(schema.intelSignals.severity, "low"),
      )!,
    );
  } else if (kind === "noise") {
    conditions.push(
      and(
        eq(schema.intelSignals.severity, "low"),
        inArray(schema.intelSignals.scope, [...NOISE_SCOPES]),
      )!,
    );
  }

  const result = await db
    .update(schema.intelSignals)
    .set({ userStatus: "read" })
    .where(and(...conditions))
    .returning({ id: schema.intelSignals.id });

  revalidateTag("strategy", "default");
  return NextResponse.json({ ok: true, marked: result.length, kind });
}
