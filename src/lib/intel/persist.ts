import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { DetectorSignal } from "./types";

/**
 * Persiste un batch de signals. Idempotente por dedupKey (INSERT OR IGNORE via
 * unique constraint + try/catch en drizzle). Devuelve los IDs creados.
 */
export async function persistSignals(
  candidates: DetectorSignal[],
): Promise<{ created: number[]; skipped: number }> {
  const created: number[] = [];
  let skipped = 0;

  for (const sig of candidates) {
    try {
      const existing = await db
        .select()
        .from(schema.intelSignals)
        .where(eq(schema.intelSignals.dedupKey, sig.dedupKey))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const inserted = await db
        .insert(schema.intelSignals)
        .values({
          dedupKey: sig.dedupKey,
          scope: sig.scope,
          asset: sig.asset ?? null,
          assetClass: sig.assetClass ?? null,
          severity: sig.severity,
          title: sig.title,
          summary: sig.summary,
          payload: JSON.stringify(sig.payload),
          suggestedAction: sig.suggestedAction ?? null,
          actionAmountEur: sig.actionAmountEur ?? null,
        })
        .returning({ id: schema.intelSignals.id });

      if (inserted[0]) created.push(inserted[0].id);
    } catch (err) {
      console.error("[intel] persist signal failed", sig.dedupKey, err);
      skipped++;
    }
  }

  return { created, skipped };
}
