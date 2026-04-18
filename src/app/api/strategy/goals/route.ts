import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [goal] = await db.insert(schema.strategyGoals).values(body).returning();
  return NextResponse.json(goal);
}

export async function PUT(req: NextRequest) {
  const { id, ...data } = await req.json();
  await db.update(schema.strategyGoals).set(data).where(eq(schema.strategyGoals.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(schema.strategyGoals).where(eq(schema.strategyGoals.id, id));
  return NextResponse.json({ ok: true });
}
