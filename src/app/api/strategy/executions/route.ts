import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const executions = await db.select().from(schema.dcaExecutions);
  return NextResponse.json(executions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [exec] = await db.insert(schema.dcaExecutions).values({
    planId: body.planId,
    amount: body.amount,
    price: body.price || null,
    units: body.units || null,
    date: body.date || new Date().toISOString().split("T")[0],
    notes: body.notes || null,
  }).returning();

  // Update nextExecution on the plan
  const plans = await db.select().from(schema.investmentPlans).where(eq(schema.investmentPlans.id, body.planId));
  if (plans.length > 0) {
    const plan = plans[0];
    const next = new Date();
    if (plan.frequency === "daily") next.setDate(next.getDate() + 1);
    else if (plan.frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (plan.frequency === "biweekly") next.setDate(next.getDate() + 14);
    else next.setMonth(next.getMonth() + 1);

    await db.update(schema.investmentPlans)
      .set({ nextExecution: next.toISOString().split("T")[0] })
      .where(eq(schema.investmentPlans.id, body.planId));
  }

  return NextResponse.json(exec);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(schema.dcaExecutions).where(eq(schema.dcaExecutions.id, id));
  return NextResponse.json({ ok: true });
}
