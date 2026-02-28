import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const txs = await db.query.transactions.findMany({
    orderBy: [desc(schema.transactions.date)],
    limit: 100,
  });
  return NextResponse.json(txs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  body.total = body.amount * (body.price || 0);
  const [tx] = await db.insert(schema.transactions).values(body).returning();
  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  return NextResponse.json({ ok: true });
}
