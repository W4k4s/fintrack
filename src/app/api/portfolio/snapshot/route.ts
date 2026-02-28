import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const snapshots = await db.select().from(schema.portfolioSnapshots).orderBy(desc(schema.portfolioSnapshots.date)).limit(90);
  return NextResponse.json(snapshots.reverse());
}

export async function POST() {
  const assets = await db.select().from(schema.assets);
  const totalValue = assets.reduce((sum, a) => sum + a.amount * (a.currentPrice || 0), 0);
  const date = new Date().toISOString().split("T")[0];
  const [snapshot] = await db.insert(schema.portfolioSnapshots).values({ totalValue, date }).returning();
  return NextResponse.json(snapshot);
}
