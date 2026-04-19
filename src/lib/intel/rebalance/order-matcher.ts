import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import type { IntelRebalanceOrder } from "@/lib/db/schema";

/**
 * Transacción normalizada en EUR + venue listo para intentar match contra
 * `intel_rebalance_orders`. El caller es responsable de convertir a EUR la
 * cotización (USDT/USD → EUR) antes de pasar `amountEur`.
 */
export interface MatchableTransaction {
  symbol: string;
  venue: string; // exchange slug
  type: "buy" | "sell";
  amountEur: number;
  date: string; // ISO
}

/** Ventana temporal desde la creación de la order para considerar el trade como posible match. */
export const MATCH_WINDOW_MS = 30 * 24 * 3600 * 1000;

const STABLE_USD_CURRENCIES = new Set(["USD", "USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"]);

/**
 * Convierte un importe en quoteCurrency a EUR. EUR directo, stablecoins USD y
 * USD vía eurPerUsd. Otras monedas → null (el caller decide saltarse el match).
 */
export function toEurAmount(
  total: number | null | undefined,
  currency: string | null | undefined,
  eurPerUsd: number,
): number | null {
  if (total == null || !Number.isFinite(total)) return null;
  const c = (currency ?? "").toUpperCase();
  if (c === "EUR") return total;
  if (STABLE_USD_CURRENCIES.has(c)) return total * eurPerUsd;
  return null;
}
/** Tolerancia relativa del importe (±20%). El redondeo a 10€ del plan + slippage pequeños caben aquí. */
export const AMOUNT_TOLERANCE = 0.2;

/**
 * Pura, sin IO. Filtra órdenes candidatas que matchean `tx` aplicando criterios
 * exactos (symbol, venue, type) + tolerancia en importe y ventana temporal.
 *
 * Si devuelve >1, el caller DEBE considerarlo ambiguo y NO auto-marcar
 * (feedback staff P0.3: no auto-dismiss silencioso).
 */
export function findMatchingOrders(
  tx: MatchableTransaction,
  pendingOrders: IntelRebalanceOrder[],
): IntelRebalanceOrder[] {
  const txTime = Date.parse(tx.date);
  if (!Number.isFinite(txTime)) return [];

  return pendingOrders.filter((o) => {
    if (o.status !== "pending") return false;
    if (o.type !== tx.type) return false;
    if (o.assetSymbol !== tx.symbol) return false;
    if (o.venue !== tx.venue) return false;

    const orderTime = Date.parse(o.createdAt);
    if (!Number.isFinite(orderTime)) return false;
    // La orden tiene que haberse creado ANTES o alrededor de la fecha del tx,
    // y dentro de la ventana. No matcheamos una order futura con un tx viejo.
    if (Math.abs(txTime - orderTime) > MATCH_WINDOW_MS) return false;

    const minAmt = o.amountEur * (1 - AMOUNT_TOLERANCE);
    const maxAmt = o.amountEur * (1 + AMOUNT_TOLERANCE);
    if (tx.amountEur < minAmt || tx.amountEur > maxAmt) return false;

    return true;
  });
}

export interface MatchResult {
  matched: IntelRebalanceOrder | null;
  ambiguousCandidates: IntelRebalanceOrder[];
}

/**
 * Intenta auto-marcar una order `executed` desde un trade real. Si hay 0
 * candidatos → no-op. Si hay exactamente 1 → marca executed con
 * `actualAmountEur = tx.amountEur`. Si hay >1 → no marca, registra en log y
 * devuelve `ambiguousCandidates` (el caller puede loggear o mostrarlo).
 */
export async function tryAutoMatchOrder(
  tx: MatchableTransaction,
): Promise<MatchResult> {
  const pending = await db
    .select()
    .from(schema.intelRebalanceOrders)
    .where(
      and(
        eq(schema.intelRebalanceOrders.status, "pending"),
        eq(schema.intelRebalanceOrders.assetSymbol, tx.symbol),
        eq(schema.intelRebalanceOrders.venue, tx.venue),
        eq(schema.intelRebalanceOrders.type, tx.type),
      ),
    );

  const candidates = findMatchingOrders(tx, pending);
  if (candidates.length === 0) return { matched: null, ambiguousCandidates: [] };
  if (candidates.length > 1) {
    console.warn(
      `[order-matcher] ambiguous — ${candidates.length} pending orders match`,
      { symbol: tx.symbol, venue: tx.venue, amountEur: tx.amountEur },
      candidates.map((c) => ({ id: c.id, amountEur: c.amountEur, createdAt: c.createdAt })),
    );
    return { matched: null, ambiguousCandidates: candidates };
  }

  const order = candidates[0];
  const nowIso = new Date().toISOString();
  await db
    .update(schema.intelRebalanceOrders)
    .set({
      status: "executed",
      executedAt: nowIso,
      actualAmountEur: tx.amountEur,
      updatedAt: nowIso,
      notes: `auto-match ${tx.symbol} ${tx.amountEur.toFixed(0)}€ @ ${tx.venue} ${tx.date}`,
    })
    .where(eq(schema.intelRebalanceOrders.id, order.id));

  return {
    matched: { ...order, status: "executed", executedAt: nowIso, actualAmountEur: tx.amountEur },
    ambiguousCandidates: [],
  };
}

/**
 * Batch helper: procesa varios trades en serie, agrega resultados. Usado por
 * los hooks de sync exchange e import TR.
 */
export async function tryAutoMatchOrdersBatch(
  txs: MatchableTransaction[],
): Promise<{ matched: IntelRebalanceOrder[]; ambiguous: number }> {
  const matched: IntelRebalanceOrder[] = [];
  let ambiguous = 0;
  for (const tx of txs) {
    try {
      const r = await tryAutoMatchOrder(tx);
      if (r.matched) matched.push(r.matched);
      if (r.ambiguousCandidates.length > 0) ambiguous++;
    } catch (err) {
      console.error("[order-matcher] tryAutoMatchOrder failed", tx, err);
    }
  }
  return { matched, ambiguous };
}
