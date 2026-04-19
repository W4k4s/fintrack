import { db, schema } from "@/lib/db";
import { and, inArray, lt, or } from "drizzle-orm";

const RETENTION_DAYS = 30;
const OPPORTUNISTIC_TRIGGER_DAYS = 45;

/**
 * Delete intel_signals older than RETENTION_DAYS that are no longer actionable
 * (userStatus in acted/dismissed), plus anything with resolvedAt past the
 * retention window. intel_notifications cascade via FK.
 *
 * Opportunistic: runs only if the oldest signal in DB is already past the
 * trigger threshold, so most ticks skip without hitting DELETE.
 */
export async function cleanupOldSignals(): Promise<{ deleted: number; ran: boolean }> {
  const triggerIso = new Date(Date.now() - OPPORTUNISTIC_TRIGGER_DAYS * 86400_000).toISOString();
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();

  const [oldest] = await db
    .select({ createdAt: schema.intelSignals.createdAt })
    .from(schema.intelSignals)
    .orderBy(schema.intelSignals.createdAt)
    .limit(1);
  if (!oldest || oldest.createdAt > triggerIso) {
    return { deleted: 0, ran: false };
  }

  const deleted = await db
    .delete(schema.intelSignals)
    .where(
      or(
        and(
          lt(schema.intelSignals.createdAt, cutoffIso),
          inArray(schema.intelSignals.userStatus, ["acted", "dismissed"]),
        ),
        and(
          lt(schema.intelSignals.resolvedAt, cutoffIso),
        ),
      ),
    )
    .returning({ id: schema.intelSignals.id });

  return { deleted: deleted.length, ran: true };
}
