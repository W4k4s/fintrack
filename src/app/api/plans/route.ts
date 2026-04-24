import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const plans = await db.select().from(schema.investmentPlans);
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [plan] = await db.insert(schema.investmentPlans).values(body).returning();
  revalidateTag("strategy", "default");
  return NextResponse.json(plan);
}

export async function PUT(req: NextRequest) {
  const { id, ...data } = await req.json();
  await db.update(schema.investmentPlans).set(data).where(eq(schema.investmentPlans.id, id));
  revalidateTag("strategy", "default");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(schema.investmentPlans).where(eq(schema.investmentPlans.id, id));
  revalidateTag("strategy", "default");
  return NextResponse.json({ ok: true });
}
