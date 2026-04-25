import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { ISIN_MAP } from "@/lib/isin-map";

/**
 * Auto-match exchange trades (buys) to DCA plans.
 * After a sync, call this to create dca_executions from new trades.
 *
 * Logic:
 * - For each active DCA plan, find recent BUY transactions for that asset
 * - Only match trades not already linked to an execution
 * - Group trades by week and create one execution per week
 *
 * Amounts in dca_executions are stored in EUR. Trades come in quote currency
 * (USDC, USDT, USD, EUR, ...) — convert to EUR using current rates.
 */

// -- Shape unificado --------------------------------------------------------
// Los 3 entrypoints (matchTradesToDCA, matchTrTradesToDCA, matchTrBankTxToDCA)
// normalizan a este shape antes de llamar al helper común.
export interface TradeForDca {
  date: string;             // YYYY-MM-DD
  symbol: string;           // resuelto (BTC, MSCI World, ...)
  side: "buy" | "sell";
  amountEur: number;        // principal (sin fees) en EUR
  feeEur: number;           // 0 si no se conoce
  units: number;
  priceEur: number | null;
  source: string;           // notes hint ("exchange trade" / "TR CSV" / "TR PDF")
}

interface InsertOpts {
  /** Etiqueta usada en el campo notes ("Auto-sync", "Auto-TR", ...). */
  notesLabel: string;
  /** Si true, actualiza investment_plans.next_execution tras matchear. */
  updateNextExecution?: boolean;
}

// Helper común. Agrupa trades por (planId, date) — el target del plan está
// definido por mes y los DCA caen en una sola fecha — inserta principal en
// dca_executions.amount, fee aparte en fee_eur.
async function insertDcaExecutionsFromTrades(
  trades: TradeForDca[],
  opts: InsertOpts,
): Promise<{ matched: number; skipped: number }> {
  if (!trades.length) return { matched: 0, skipped: 0 };
  const plans = await db.select().from(schema.investmentPlans);
  const activePlans = plans.filter((p) => p.enabled);
  if (activePlans.length === 0) return { matched: 0, skipped: 0 };

  const planBySymbol = new Map<string, (typeof activePlans)[number]>();
  for (const p of activePlans) planBySymbol.set(p.asset, p);

  const existing = await db.select().from(schema.dcaExecutions);
  const existingKey = new Set(existing.map((e) => `${e.planId}:${e.date}`));

  type Group = {
    planId: number;
    date: string;
    amountEur: number;
    feeEur: number;
    units: number;
    items: number;
    sources: Set<string>;
  };
  const groups = new Map<string, Group>();
  let skipped = 0;

  for (const t of trades) {
    if (t.side !== "buy") continue;
    const plan = planBySymbol.get(t.symbol);
    if (!plan) continue;
    const key = `${plan.id}:${t.date}`;
    if (existingKey.has(key)) {
      skipped++;
      continue;
    }
    const prev = groups.get(key);
    if (prev) {
      prev.amountEur += t.amountEur;
      prev.feeEur += t.feeEur;
      prev.units += t.units;
      prev.items += 1;
      if (t.source) prev.sources.add(t.source);
    } else {
      groups.set(key, {
        planId: plan.id,
        date: t.date,
        amountEur: t.amountEur,
        feeEur: t.feeEur,
        units: t.units,
        items: 1,
        sources: new Set(t.source ? [t.source] : []),
      });
    }
  }

  let matched = 0;
  for (const g of groups.values()) {
    const avgPrice = g.units > 0 ? g.amountEur / g.units : null;
    const sourceTag = [...g.sources][0];
    await db.insert(schema.dcaExecutions).values({
      planId: g.planId,
      date: g.date,
      amount: Math.round(g.amountEur * 100) / 100,
      price: avgPrice ? Math.round(avgPrice * 10000) / 10000 : null,
      units: Math.round(g.units * 1e8) / 1e8,
      feeEur: g.feeEur > 0 ? Math.round(g.feeEur * 100) / 100 : null,
      notes: `${opts.notesLabel}: ${g.items} tx${g.items > 1 ? "s" : ""}${sourceTag ? ` (${sourceTag})` : ""}`,
    });
    matched++;
  }

  if (opts.updateNextExecution && matched > 0) {
    const lastDateByPlan = new Map<number, string>();
    for (const g of groups.values()) {
      const prev = lastDateByPlan.get(g.planId);
      if (!prev || g.date > prev) lastDateByPlan.set(g.planId, g.date);
    }
    for (const [planId, lastDate] of lastDateByPlan) {
      const plan = activePlans.find((p) => p.id === planId);
      if (!plan) continue;
      const next = new Date(lastDate);
      if (plan.frequency === "daily") next.setDate(next.getDate() + 1);
      else if (plan.frequency === "weekly") next.setDate(next.getDate() + 7);
      else if (plan.frequency === "biweekly") next.setDate(next.getDate() + 14);
      else next.setMonth(next.getMonth() + 1);
      await db
        .update(schema.investmentPlans)
        .set({ nextExecution: next.toISOString().split("T")[0] })
        .where(eq(schema.investmentPlans.id, planId));
    }
  }

  return { matched, skipped };
}

const USD_STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

async function fetchRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    return data.rates || { USD: 1, EUR: 0.85 };
  } catch {
    return { USD: 1, EUR: 0.85 };
  }
}

// Convert an amount from its quote currency to EUR.
// rates[X] = how many X per 1 USD. So USD→EUR = rates.EUR; X→USD = amount/rates[X]; then × rates.EUR.
export function toEur(amount: number, quoteCurrency: string, rates: Record<string, number>): number {
  const q = (quoteCurrency || "USD").toUpperCase();
  const eurPerUsd = rates.EUR || 0.85;
  if (q === "EUR") return amount;
  if (USD_STABLECOINS.has(q)) return amount * eurPerUsd;
  const srcRate = rates[q];
  if (!srcRate) return amount * eurPerUsd; // unknown — best effort
  return (amount / srcRate) * eurPerUsd;
}

export async function matchTradesToDCA() {
  const allTx = await db.select().from(schema.transactions);
  const buys = allTx.filter((t) => t.type === "buy");
  if (buys.length === 0) return { matched: 0, skipped: 0 };

  const rates = await fetchRates();

  // Normaliza transactions → TradeForDca. Sin fees explícitos del exchange:
  // los trades sintetizados ya vienen en quoteCurrency convertido a EUR.
  const trades: TradeForDca[] = buys.map((t) => ({
    date: t.date.split("T")[0],
    symbol: t.symbol,
    side: "buy" as const,
    amountEur: toEur(t.total || 0, t.quoteCurrency || "USD", rates),
    feeEur: 0,
    units: t.amount,
    priceEur: null, // calculado por el helper como amount/units
    source: t.notes || "exchange trade",
  }));

  return insertDcaExecutionsFromTrades(trades, {
    notesLabel: "Auto-sync",
    updateNextExecution: true,
  });
}

/**
 * Shape esperado por el matcher TR — cada trade viene con principal separado
 * de fee para que imputemos correctamente al target del plan (450€/mes =
 * principal, no principal+fees).
 */
export interface TrTradeForDca {
  date: string;
  side: "buy" | "sell";
  symbol: string;
  principalEur: number;
  feeEur: number;
  units: number;
  priceEur: number;
}

/**
 * Versión para Trade Republic CSV: las compras TR vienen del parser con
 * principal/fee separados. Agrupa por (plan_id, date) y delega en el helper
 * común. Dedup por (plan_id, date) — reimport idempotente.
 */
export async function matchTrTradesToDCA(trades: TrTradeForDca[]) {
  if (!trades.length) return { matched: 0, skipped: 0 };
  const normalized: TradeForDca[] = trades.map((t) => ({
    date: t.date,
    symbol: t.symbol,
    side: t.side,
    amountEur: t.principalEur,
    feeEur: t.feeEur,
    units: t.units,
    priceEur: t.priceEur || null,
    source: "TR CSV",
  }));
  return insertDcaExecutionsFromTrades(normalized, { notesLabel: "Auto-TR" });
}

/**
 * @deprecated Fallback legacy del flujo PDF. Cuando todo TR pase por el CSV
 * canónico (UNIQUE source+external_id en bank_transactions), eliminar este
 * matcher. Mientras tanto: lee bank_transactions TR antiguas (sin
 * external_id), resuelve ISIN→symbol y delega en el helper común. El fee
 * fijo TR_FEE_EUR=1 se resta del debit (debit incluía principal+fee).
 */
export async function matchTrBankTxToDCA() {
  const trTrades = await db
    .select()
    .from(schema.bankTransactions)
    .where(
      and(
        eq(schema.bankTransactions.source, "trade-republic"),
        eq(schema.bankTransactions.type, "trade"),
      ),
    );

  const isinRegex = /Buy\s+trade\s+([A-Z]{2}[A-Z0-9]{10})/i;
  const TR_FEE_EUR = 1;

  // Una "trade" sintética por bank_tx: el debit ya incluye el fee de la orden,
  // pero hay órdenes partidas en varias rows. Repartimos el fee SOLO en una
  // de cada grupo (la primera que se procese por orden) para evitar duplicar.
  // Truco: emitimos cada row con feeEur=0 y un fee adicional una sola vez por
  // grupo. Como el helper agrupa por (planId, date), inyectamos el fee sólo
  // a la primera tx con esa key vista en este recorrido.
  const seenKeys = new Set<string>();
  const trades: TradeForDca[] = [];

  for (const tx of trTrades) {
    if (!tx.debit || tx.debit <= 0) continue;
    const m = tx.description.match(isinRegex);
    if (!m) continue;
    const symbol = ISIN_MAP[m[1]];
    if (!symbol) continue;
    // Necesito plan.id para construir la key — el helper lo hace después,
    // pero aquí basta con (symbol, date) ya que un símbolo mapea a un plan.
    const key = `${symbol}:${tx.date}`;
    const isFirstOfGroup = !seenKeys.has(key);
    if (isFirstOfGroup) seenKeys.add(key);

    trades.push({
      date: tx.date,
      symbol,
      side: "buy",
      // Resta fee solo de la primera tx del grupo: el resto irá completo y
      // suma de toda la cesta menos un fee = principal correcto.
      amountEur: isFirstOfGroup ? Math.max(0, tx.debit - TR_FEE_EUR) : tx.debit,
      feeEur: isFirstOfGroup ? TR_FEE_EUR : 0,
      units: 0,
      priceEur: null,
      source: "TR PDF",
    });
  }

  return insertDcaExecutionsFromTrades(trades, { notesLabel: "Auto-TR" });
}
