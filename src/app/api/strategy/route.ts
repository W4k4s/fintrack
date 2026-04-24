import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { validateProfileUpdate } from "@/lib/strategy/profile-validation";
import { emergencyTargetEur } from "@/lib/strategy/health-calc";

// Seed default profile if none exists
async function ensureProfile() {
  const existing = await db.select().from(schema.strategyProfiles).limit(1);
  if (existing.length > 0) return existing[0];
  
  const [profile] = await db.insert(schema.strategyProfiles).values({
    name: "Estrategia 2026",
    riskProfile: "balanced",
    targetCash: 15,
    targetEtfs: 30,
    targetCrypto: 25,
    targetGold: 10,
    targetBonds: 10,
    targetStocks: 10,
    monthlyInvest: 903,
    emergencyMonths: 3,
    active: true,
    notes: "Portfolio rebalancing post-ING/TR sync. Extreme Fear market = opportunity.",
  }).returning();

  // Seed goals
  await db.insert(schema.strategyGoals).values([
    { profileId: profile.id, name: "Fondo de emergencia", type: "emergency_fund", targetValue: 6643, targetUnit: "EUR", priority: 1 },
    { profileId: profile.id, name: "Acumular 0.05 BTC", type: "asset_target", targetValue: 0.05, targetAsset: "BTC", targetUnit: "units", priority: 2 },
    { profileId: profile.id, name: "Net Worth €25k", type: "net_worth", targetValue: 25000, targetUnit: "EUR", priority: 2 },
    { profileId: profile.id, name: "MSCI World €5k", type: "asset_target", targetValue: 5000, targetAsset: "MSCI World", targetUnit: "EUR", priority: 3 },
  ]);

  return profile;
}

export async function GET() {
  const profile = await ensureProfile();
  const goals = await db.select().from(schema.strategyGoals)
    .where(eq(schema.strategyGoals.profileId, profile.id));
  const plans = await db.select().from(schema.investmentPlans);
  const executions = await db.select().from(schema.dcaExecutions);
  
  return NextResponse.json({ profile, goals, plans, executions });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const validated = validateProfileUpdate(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { id, ...data } = validated.value;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const updateData = { ...data, updatedAt: new Date().toISOString() };
  await db.update(schema.strategyProfiles).set(updateData).where(eq(schema.strategyProfiles.id, id));

  // R1: si cambian monthlyFixedExpenses o emergencyMonths, sincronizamos el
  // target_value del goal emergency_fund para que tabla y UI estén alineadas.
  if (data.monthlyFixedExpenses !== undefined || data.emergencyMonths !== undefined) {
    const [current] = await db
      .select()
      .from(schema.strategyProfiles)
      .where(eq(schema.strategyProfiles.id, id))
      .limit(1);
    if (current) {
      const newTarget = emergencyTargetEur({
        monthlyFixedExpenses: current.monthlyFixedExpenses,
        emergencyMonths: current.emergencyMonths,
      });
      await db
        .update(schema.strategyGoals)
        .set({ targetValue: newTarget })
        .where(and(eq(schema.strategyGoals.profileId, id), eq(schema.strategyGoals.type, "emergency_fund")));
    }
  }

  revalidateTag("strategy", "default");
  return NextResponse.json({ ok: true });
}
