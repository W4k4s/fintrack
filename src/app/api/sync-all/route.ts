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

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: exchanges.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
