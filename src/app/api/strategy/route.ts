import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

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
  const { id, ...data } = await req.json();
  data.updatedAt = new Date().toISOString();
  await db.update(schema.strategyProfiles).set(data).where(eq(schema.strategyProfiles.id, id));
  return NextResponse.json({ ok: true });
}
