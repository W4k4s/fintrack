import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { syncExchange } from "@/lib/exchanges";

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export async function POST() {
  try {
    const exchanges = await db.select().from(schema.exchanges)
      .where(eq(schema.exchanges.type, "auto"));

    const now = Date.now();
    const results: { name: string; status: string; synced?: number }[] = [];

    for (const ex of exchanges) {
      const lastSync = ex.lastSync ? new Date(ex.lastSync).getTime() : 0;
      if (now - lastSync < COOLDOWN_MS) {
        results.push({ name: ex.name, status: "skipped (recent)" });
        continue;
      }

      try {
        const result = await syncExchange(ex.id);
        results.push({ name: ex.name, status: "synced", synced: result.synced });
      } catch (err: any) {
        results.push({ name: ex.name, status: `error: ${err.message}` });
      }
    }

    const synced = results.filter(r => r.status === "synced").length;
    const skipped = results.filter(r => r.status.startsWith("skipped")).length;

    // Save daily portfolio snapshot after sync
    let snapshotStatus = "skipped";
    if (synced > 0) {
      try {
        const today = new Date().toISOString().split("T")[0];
        const [existing] = await db.select().from(schema.portfolioSnapshots)
          .where(eq(schema.portfolioSnapshots.date, today)).limit(1);

        const assets = await db.select().from(schema.assets);
        const totalValue = assets.reduce((sum, a) => sum + a.amount * (a.currentPrice || 0), 0);

        if (totalValue > 0) {
          if (existing) {
            await db.update(schema.portfolioSnapshots)
              .set({ totalValue })
              .where(eq(schema.portfolioSnapshots.id, existing.id));
            snapshotStatus = "updated";
          } else {
            await db.insert(schema.portfolioSnapshots)
              .values({ totalValue, date: today });
            snapshotStatus = "created";
          }
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: exchanges.length,
      snapshot: snapshotStatus,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
