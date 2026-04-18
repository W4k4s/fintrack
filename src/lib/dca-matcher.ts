import { db, schema } from "@/lib/db";
import { eq, and, gte, isNull } from "drizzle-orm";

/**
 * Auto-match exchange trades (buys) to DCA plans.
 * After a sync, call this to create dca_executions from new trades.
 *
 * Logic:
 * - For each active DCA plan, find recent BUY transactions for that asset
 * - Only match trades not already linked to an execution
 * - Group trades by week and create one execution per week
 */

export async function matchTradesToDCA() {
  const plans = await db.select().from(schema.investmentPlans);
  const activePlans = plans.filter(p => p.enabled);
  if (activePlans.length === 0) return { matched: 0, skipped: 0 };

  // Get all existing executions to avoid duplicates
  const existingExecs = await db.select().from(schema.dcaExecutions);
  const existingDates = new Set(
    existingExecs.map(e => `${e.planId}:${e.date}`)
  );

  // Get all buy transactions (from synced exchanges)
  const allTx = await db.select().from(schema.transactions);
  const buys = allTx.filter(t => t.type === "buy");

  let matched = 0;
  let skipped = 0;

  for (const plan of activePlans) {
    // Find buy transactions for this asset
    const assetBuys = buys.filter(t => t.symbol === plan.asset);
    if (assetBuys.length === 0) continue;

    // Group by date (one execution per day max)
    const byDate = new Map<string, typeof assetBuys>();
    for (const tx of assetBuys) {
      const date = tx.date.split("T")[0]; // normalize to YYYY-MM-DD
      const existing = byDate.get(date) || [];
      existing.push(tx);
      byDate.set(date, existing);
    }

    for (const [date, trades] of byDate) {
      // Skip if already have execution for this plan+date
      const key = `${plan.id}:${date}`;
      if (existingDates.has(key)) {
        skipped++;
        continue;
      }

      // Aggregate trades for this day
      const totalAmount = trades.reduce((s, t) => s + (t.total || 0), 0);
      const totalUnits = trades.reduce((s, t) => s + t.amount, 0);
      const avgPrice = totalUnits > 0 ? totalAmount / totalUnits : null;
      const sources = [...new Set(trades.map(t => t.notes).filter(Boolean))];

      // Create execution
      await db.insert(schema.dcaExecutions).values({
        planId: plan.id,
        amount: Math.round(totalAmount * 100) / 100,
        price: avgPrice ? Math.round(avgPrice * 100) / 100 : null,
        units: Math.round(totalUnits * 1e8) / 1e8,
        date,
        notes: `Auto-sync: ${sources[0] || "exchange trade"}`,
      });

      existingDates.add(key);
      matched++;
    }

    // Update nextExecution based on frequency
    if (matched > 0) {
      const latestExec = [...byDate.keys()].sort().pop();
      if (latestExec) {
        const next = new Date(latestExec);
        if (plan.frequency === "daily") next.setDate(next.getDate() + 1);
        else if (plan.frequency === "weekly") next.setDate(next.getDate() + 7);
        else if (plan.frequency === "biweekly") next.setDate(next.getDate() + 14);
        else next.setMonth(next.getMonth() + 1);

        await db.update(schema.investmentPlans)
          .set({ nextExecution: next.toISOString().split("T")[0] })
          .where(eq(schema.investmentPlans.id, plan.id));
      }
    }
  }

  return { matched, skipped };
}
