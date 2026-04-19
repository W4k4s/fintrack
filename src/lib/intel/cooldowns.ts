import { db, schema } from "@/lib/db";
import { eq, gte } from "drizzle-orm";
import { COOLDOWN_CONFIG } from "./metrics";

export interface CooldownEvaluation {
  scope: string;
  dismissedRate: number;
  sampleSize: number;
  applied: boolean;
  cooldownUntil: string | null;
}

/**
 * Scan every scope that has surfaced signals within the feedback window. When
 * dismissedRate crosses the configured threshold AND the sample is large
 * enough, upsert a cooldown row that suppresses Telegram notifications for
 * that scope until the cooldown expires. Signals still reach the panel.
 *
 * Idempotent — safe to call at the end of every tick. Cooldowns that already
 * exist get their `until` extended only if the ratio still breaches the
 * threshold; if the scope has recovered, the row is left alone to expire
 * naturally.
 */
export async function evaluateCooldowns(now: Date = new Date()): Promise<CooldownEvaluation[]> {
  const sinceIso = new Date(now.getTime() - COOLDOWN_CONFIG.windowDays * 86400_000).toISOString();
  const signals = await db
    .select({ scope: schema.intelSignals.scope, userStatus: schema.intelSignals.userStatus })
    .from(schema.intelSignals)
    .where(gte(schema.intelSignals.createdAt, sinceIso));

  const agg = new Map<string, { total: number; dismissed: number }>();
  for (const s of signals) {
    const cur = agg.get(s.scope) ?? { total: 0, dismissed: 0 };
    cur.total++;
    if (s.userStatus === "dismissed") cur.dismissed++;
    agg.set(s.scope, cur);
  }

  const cooldownUntilIso = new Date(
    now.getTime() + COOLDOWN_CONFIG.durationDays * 86400_000,
  ).toISOString();

  const results: CooldownEvaluation[] = [];
  for (const [scope, { total, dismissed }] of agg) {
    const rate = total > 0 ? dismissed / total : 0;
    const breaches = total >= COOLDOWN_CONFIG.minSamples && rate > COOLDOWN_CONFIG.dismissThreshold;
    if (!breaches) {
      results.push({ scope, dismissedRate: rate, sampleSize: total, applied: false, cooldownUntil: null });
      continue;
    }

    const nowIso = now.toISOString();
    const [existing] = await db
      .select()
      .from(schema.intelScopeCooldowns)
      .where(eq(schema.intelScopeCooldowns.scope, scope))
      .limit(1);

    if (existing) {
      await db
        .update(schema.intelScopeCooldowns)
        .set({
          cooldownUntil: cooldownUntilIso,
          reason: "high_dismiss_rate",
          dismissedRate: rate,
          sampleSize: total,
          updatedAt: nowIso,
        })
        .where(eq(schema.intelScopeCooldowns.scope, scope));
    } else {
      await db.insert(schema.intelScopeCooldowns).values({
        scope,
        cooldownUntil: cooldownUntilIso,
        reason: "high_dismiss_rate",
        dismissedRate: rate,
        sampleSize: total,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    results.push({ scope, dismissedRate: rate, sampleSize: total, applied: true, cooldownUntil: cooldownUntilIso });
  }

  return results;
}

/** Returns cooldownUntil if scope is currently in cooldown (> now), else null. */
export async function getActiveCooldown(scope: string, now: Date = new Date()): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.intelScopeCooldowns)
    .where(eq(schema.intelScopeCooldowns.scope, scope))
    .limit(1);
  if (!row) return null;
  return row.cooldownUntil > now.toISOString() ? row.cooldownUntil : null;
}
