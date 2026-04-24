import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getStrategyContext } from "@/lib/strategy/context";
import { buildSchedule } from "@/lib/strategy/schedule";

// Weekly/monthly DCA schedule. Toda la lógica derivada vive en
// src/lib/strategy/schedule.ts (F1 consolidation) — este route sólo compone.

export async function GET() {
  try {
    const plans = await db.select().from(schema.investmentPlans);
    const activePlans = plans.filter((p) => p.enabled);
    const executions = await db.select().from(schema.dcaExecutions);

    const { fgValue, policies, mctx } = await getStrategyContext();

    const payload = buildSchedule(activePlans, executions, {
      fgValue,
      policies,
      mctx,
      now: new Date(),
    });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Schedule error:", err);
    return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 });
  }
}
