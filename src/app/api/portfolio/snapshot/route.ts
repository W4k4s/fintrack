import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET() {
  const snapshots = await db.query.portfolioSnapshots.findMany({
    orderBy: (s, { desc }) => [desc(s.date)],
    limit: 90,
  });
  return NextResponse.json(snapshots.reverse());
}

export async function POST() {
  // Calculate current total
  const assets = await db.query.assets.findMany();
  const totalValue = assets.reduce((sum, a) => sum + a.amount * (a.currentPrice || 0), 0);
  const date = new Date().toISOString().split("T")[0];

  const [snapshot] = await db.insert(schema.portfolioSnapshots)
    .values({ totalValue, date })
    .returning();

  return NextResponse.json(snapshot);
}
