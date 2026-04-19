import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ASSET_CLASSES, type AssetClass } from "./classify";
import { computeAllocation } from "./compute";

export interface SnapshotClass {
  actualPct: number;
  targetPct: number;
  driftPp: number;
}

const TARGET_COL: Record<AssetClass, keyof typeof schema.strategyProfiles.$inferSelect> = {
  cash: "targetCash",
  crypto: "targetCrypto",
  etfs: "targetEtfs",
  gold: "targetGold",
  bonds: "targetBonds",
  stocks: "targetStocks",
};

/**
 * Escribe un snapshot de allocation para el día `now`. Idempotente: si ya
 * existe un snapshot para la fecha, no hace nada (INSERT OR IGNORE via UNIQUE
 * constraint sobre `date`).
 */
export async function recordAllocationSnapshot(now: Date): Promise<void> {
  const [profile] = await db
    .select()
    .from(schema.strategyProfiles)
    .where(eq(schema.strategyProfiles.active, true))
    .limit(1);
  if (!profile) return;

  const allocation = await computeAllocation();
  if (allocation.netWorth <= 0) return;

  const date = now.toISOString().slice(0, 10);

  const byClass: Record<string, SnapshotClass> = {};
  for (const cls of ASSET_CLASSES) {
    const actualPct = allocation.byClass[cls]?.pct ?? 0;
    const targetPct = Number(profile[TARGET_COL[cls]] ?? 0);
    byClass[cls] = {
      actualPct: Math.round(actualPct * 100) / 100,
      targetPct,
      driftPp: Math.round((actualPct - targetPct) * 100) / 100,
    };
  }

  try {
    await db
      .insert(schema.intelAllocationSnapshots)
      .values({
        date,
        profileId: profile.id,
        netWorthEur: Math.round(allocation.netWorth * 100) / 100,
        allocation: JSON.stringify(byClass),
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[intel] snapshot insert failed", err);
  }
}
