import { db, schema } from "@/lib/db";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import type { RebalancePlan } from "./types";

/** Ventana antes de marcar una order pending como `stale` (expirada por tiempo). */
export const ORDER_EXPIRATION_DAYS = 14;

/**
 * Transforma un plan a filas listas para insertar. Pura, sin IO — testable.
 * Orders con symbol=null (needsStrategyPick) quedan en status="needs_pick" y
 * no entran en auto-match hasta que el usuario elija symbol.
 */
export function planToOrderRows(
  signalId: number,
  plan: RebalancePlan,
): Array<typeof schema.intelRebalanceOrders.$inferInsert> {
  const rows: Array<typeof schema.intelRebalanceOrders.$inferInsert> = [];

  for (const s of plan.moves.sells) {
    rows.push({
      signalId,
      type: "sell",
      assetSymbol: s.symbol,
      assetClass: s.class,
      venue: s.venue,
      amountEur: s.amountEur,
      status: "pending",
    });
  }

  for (const b of plan.moves.buys) {
    const needsPick = Boolean(b.needsStrategyPick) || b.symbol === null;
    rows.push({
      signalId,
      type: "buy",
      assetSymbol: b.symbol,
      assetClass: b.class,
      venue: b.venue,
      amountEur: b.amountEur,
      status: needsPick ? "needs_pick" : "pending",
    });
  }

  return rows;
}

/**
 * Persiste las filas generadas por `planToOrderRows`.
 */
export async function createOrdersFromPlan(
  signalId: number,
  plan: RebalancePlan,
): Promise<number> {
  const rows = planToOrderRows(signalId, plan);
  if (rows.length === 0) return 0;
  await db.insert(schema.intelRebalanceOrders).values(rows);
  return rows.length;
}

/**
 * Marca como `superseded` las órdenes pending/needs_pick de signals `drift`
 * anteriores, excluyendo el signal nuevo. Previene arrastre de planes viejos
 * cuando el detector genera un plan nuevo (nueva semana o profile change).
 */
export async function supersedePreviousOrders(
  keepSignalId: number,
): Promise<number> {
  // Tomamos los signal IDs de scope=drift con plan agregado (assetClass=null).
  const driftPlanSignals = await db
    .select({ id: schema.intelSignals.id })
    .from(schema.intelSignals)
    .where(
      and(
        eq(schema.intelSignals.scope, "drift"),
        // El signal agregado de plan tiene assetClass=null; los por-clase tienen assetClass != null.
        // No podemos expresar IS NULL con drizzle así — usamos los signals que tienen orders asociadas.
        ne(schema.intelSignals.id, keepSignalId),
      ),
    );

  if (driftPlanSignals.length === 0) return 0;

  const ids = driftPlanSignals.map((r) => r.id);
  const result = await db
    .update(schema.intelRebalanceOrders)
    .set({
      status: "superseded",
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        inArray(schema.intelRebalanceOrders.signalId, ids),
        inArray(schema.intelRebalanceOrders.status, ["pending", "needs_pick"]),
      ),
    )
    .returning({ id: schema.intelRebalanceOrders.id });

  return result.length;
}

/**
 * Marca como `stale` las órdenes pending/needs_pick con createdAt anterior a
 * (now - ORDER_EXPIRATION_DAYS). Opportunistic — llamado desde el tick como
 * parte del cleanup, sin cron nuevo.
 */
export async function expireOldOrders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(
    now.getTime() - ORDER_EXPIRATION_DAYS * 86400 * 1000,
  ).toISOString();
  const nowIso = now.toISOString();
  const result = await db
    .update(schema.intelRebalanceOrders)
    .set({ status: "stale", updatedAt: nowIso })
    .where(
      and(
        inArray(schema.intelRebalanceOrders.status, ["pending", "needs_pick"]),
        lt(schema.intelRebalanceOrders.createdAt, cutoff),
      ),
    )
    .returning({ id: schema.intelRebalanceOrders.id });
  return result.length;
}

/**
 * Hook post-persist: si los signals creados incluyen uno agregado de plan
 * rebalance (scope=drift, assetClass=null, payload.plan), supersede los
 * anteriores y crea las órdenes nuevas.
 */
export async function syncRebalanceOrdersForCreated(
  createdIds: number[],
): Promise<{ signalId: number | null; superseded: number; created: number }> {
  if (createdIds.length === 0) return { signalId: null, superseded: 0, created: 0 };

  // Buscar el signal agregado entre los recién creados.
  const rows = await db
    .select()
    .from(schema.intelSignals)
    .where(inArray(schema.intelSignals.id, createdIds));

  const planSignal = rows.find(
    (r) => r.scope === "drift" && r.assetClass === null,
  );
  if (!planSignal) return { signalId: null, superseded: 0, created: 0 };

  let payload: unknown;
  try {
    payload = JSON.parse(planSignal.payload);
  } catch {
    return { signalId: planSignal.id, superseded: 0, created: 0 };
  }
  const plan = (payload as { plan?: RebalancePlan }).plan;
  if (!plan || !plan.moves) return { signalId: planSignal.id, superseded: 0, created: 0 };

  const superseded = await supersedePreviousOrders(planSignal.id);
  const created = await createOrdersFromPlan(planSignal.id, plan);
  return { signalId: planSignal.id, superseded, created };
}
