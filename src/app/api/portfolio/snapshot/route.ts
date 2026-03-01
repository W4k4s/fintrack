import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const snapshots = await db.select().from(schema.portfolioSnapshots).orderBy(desc(schema.portfolioSnapshots.date)).limit(90);
  return NextResponse.json(snapshots.reverse());
}

export async function POST() {
  const today = new Date().toISOString().split("T")[0];

  // Check if we already have a snapshot for today
  const [existing] = await db.select().from(schema.portfolioSnapshots)
    .where(eq(schema.portfolioSnapshots.date, today)).limit(1);

  const assets = await db.select().from(schema.assets);
  const totalValue = assets.reduce((sum, a) => sum + a.amount * (a.currentPrice || 0), 0);

  if (totalValue <= 0) {
    return NextResponse.json({ skipped: true, reason: "no value" });
  }

  if (existing) {
    // Update today's snapshot with latest value
    await db.update(schema.portfolioSnapshots)
      .set({ totalValue })
      .where(eq(schema.portfolioSnapshots.id, existing.id));
    return NextResponse.json({ ...existing, totalValue, updated: true });
  }

  const [snapshot] = await db.insert(schema.portfolioSnapshots)
    .values({ totalValue, date: today }).returning();
  return NextResponse.json({ ...snapshot, created: true });
}
