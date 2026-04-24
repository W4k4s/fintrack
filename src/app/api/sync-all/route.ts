import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { syncExchange } from "@/lib/exchanges";
import { matchTradesToDCA } from "@/lib/dca-matcher";

// Short cooldown: avoids accidental double-clicks but doesn't block real user actions.
// User-triggered calls can pass { force: true } to bypass entirely.
const COOLDOWN_MS = 30 * 1000; // 30 seconds

export async function POST(req: NextRequest) {
  try {
    let force = false;
    try {
      const body = await req.json();
      force = !!body?.force;
    } catch {}

    const exchanges = await db.select().from(schema.exchanges)
      .where(eq(schema.exchanges.type, "auto"));

    const now = Date.now();
    const results: { name: string; status: string; synced?: number; tradesInserted?: number }[] = [];

    for (const ex of exchanges) {
      const lastSync = ex.lastSync ? new Date(ex.lastSync).getTime() : 0;
      if (!force && now - lastSync < COOLDOWN_MS) {
        results.push({ name: ex.name, status: "skipped (recent)" });
        continue;
      }

      try {
        const result = await syncExchange(ex.id);
        results.push({
          name: ex.name,
          status: "synced",
          synced: result.synced,
          tradesInserted: result.tradesInserted,
        });
      } catch (err: any) {
        results.push({ name: ex.name, status: `error: ${err.message}` });
      }
    }

    const synced = results.filter(r => r.status === "synced").length;
    const skipped = results.filter(r => r.status.startsWith("skipped")).length;

    // Save daily portfolio snapshot (always — prices change even without sync)
    let snapshotStatus = "skipped";
    {
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

    // Auto-match trades to DCA plans
    let dcaMatched = { matched: 0, skipped: 0 };
    try {
      dcaMatched = await matchTradesToDCA();
    } catch {}

    revalidateTag("strategy", "default");
    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: exchanges.length,
      snapshot: snapshotStatus,
      dcaMatched,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
