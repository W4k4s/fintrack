import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

  if (!source) return NextResponse.json({ error: "source required" }, { status: 400 });

  const transactions = await db.select().from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.source, source))
    .orderBy(desc(schema.bankTransactions.date))
    .limit(limit)
    .offset(offset);

  return NextResponse.json(transactions);
}
