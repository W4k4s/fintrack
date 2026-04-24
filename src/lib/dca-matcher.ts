import { db, schema } from "@/lib/db";
import { eq, and, gte, isNull } from "drizzle-orm";
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

  const rates = await fetchRates();

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

      // Aggregate trades for this day — convert each trade's total to EUR
      // using its own quote currency so mixed-quote days (USDC + EUR) sum correctly.
      const totalAmountEur = trades.reduce(
        (s, t) => s + toEur(t.total || 0, t.quoteCurrency || "USD", rates),
        0,
      );
      const totalUnits = trades.reduce((s, t) => s + t.amount, 0);
      const avgPriceEur = totalUnits > 0 ? totalAmountEur / totalUnits : null;
      const sources = [...new Set(trades.map(t => t.notes).filter(Boolean))];

      // Create execution (amount + price stored in EUR)
      await db.insert(schema.dcaExecutions).values({
        planId: plan.id,
        amount: Math.round(totalAmountEur * 100) / 100,
        price: avgPriceEur ? Math.round(avgPriceEur * 100) / 100 : null,
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
 * Versión para Trade Republic: las compras TR entran por `bank_transactions`
 * y (en el flujo CSV) con principal/fee separados. Agrupa por (plan_id, date)
 * e inserta una dca_execution por grupo usando SOLO principal (sin fees).
 *
 * Dedup por (plan_id, date) — reimport idempotente.
 */
export async function matchTrTradesToDCA(trades: TrTradeForDca[]) {
  if (!trades.length) return { matched: 0 };
  const plans = await db.select().from(schema.investmentPlans);
  const activePlans = plans.filter((p) => p.enabled);
  if (activePlans.length === 0) return { matched: 0 };

  const planBySymbol = new Map<string, (typeof activePlans)[number]>();
  for (const p of activePlans) planBySymbol.set(p.asset, p);

  const existing = await db.select().from(schema.dcaExecutions);
  const existingKey = new Set(existing.map((e) => `${e.planId}:${e.date}`));

  type Group = {
    planId: number;
    date: string;
    principalEur: number;
    units: number;
    items: number;
  };
  const groups = new Map<string, Group>();

  for (const t of trades) {
    if (t.side !== "buy") continue;
    const plan = planBySymbol.get(t.symbol);
    if (!plan) continue;
    const key = `${plan.id}:${t.date}`;
    if (existingKey.has(key)) continue;
    const prev = groups.get(key);
    if (prev) {
      prev.principalEur += t.principalEur;
      prev.units += t.units;
      prev.items += 1;
    } else {
      groups.set(key, {
        planId: plan.id,
        date: t.date,
        principalEur: t.principalEur,
        units: t.units,
        items: 1,
      });
    }
  }

  let matched = 0;
  for (const g of groups.values()) {
    const avgPrice = g.units > 0 ? g.principalEur / g.units : null;
    await db.insert(schema.dcaExecutions).values({
      planId: g.planId,
      date: g.date,
      amount: Math.round(g.principalEur * 100) / 100,
      price: avgPrice ? Math.round(avgPrice * 10000) / 10000 : null,
      units: Math.round(g.units * 1e8) / 1e8,
      notes: `Auto-TR: ${g.items} tx${g.items > 1 ? "s" : ""}`,
    });
    matched++;
  }

  return { matched };
}

/**
 * Fallback para el flujo PDF: las bank_transactions antiguas tienen `debit`
 * que incluye fees. Restamos un fee fijo de 1€ por compra (tarifa TR estándar
 * a partir del 2025; antes era 0€ pero para operaciones >= 500€ ya aplicaba).
 * No es perfecto, pero es mejor que contar fees como principal.
 */
export async function matchTrBankTxToDCA() {
  const plans = await db.select().from(schema.investmentPlans);
  const activePlans = plans.filter((p) => p.enabled);
  if (activePlans.length === 0) return { matched: 0 };

  const planBySymbol = new Map<string, (typeof activePlans)[number]>();
  for (const p of activePlans) planBySymbol.set(p.asset, p);

  const existing = await db.select().from(schema.dcaExecutions);
  const existingKey = new Set(existing.map((e) => `${e.planId}:${e.date}`));

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
  const TR_FEE_EUR = 1; // tarifa estándar plan Pro.
  type Group = { planId: number; date: string; principalEur: number; items: number };
  const groups = new Map<string, Group>();

  for (const tx of trTrades) {
    if (!tx.debit || tx.debit <= 0) continue;
    const m = tx.description.match(isinRegex);
    if (!m) continue;
    const symbol = ISIN_MAP[m[1]];
    if (!symbol) continue;
    const plan = planBySymbol.get(symbol);
    if (!plan) continue;
    const key = `${plan.id}:${tx.date}`;
    if (existingKey.has(key)) continue;
    const prev = groups.get(key);
    // Resta fee estimada por tx: la operación puede venir partida en varias
    // filas (fraccional + entero), pero TR cobra un único fee por orden.
    // Suma el debit completo y al final restamos 1 fee por grupo.
    if (prev) {
      prev.principalEur += tx.debit;
      prev.items += 1;
    } else {
      groups.set(key, { planId: plan.id, date: tx.date, principalEur: tx.debit, items: 1 });
    }
  }

  let matched = 0;
  for (const g of groups.values()) {
    // Un fee por grupo (TR cobra por orden, no por fila).
    const principal = Math.max(0, g.principalEur - TR_FEE_EUR);
    await db.insert(schema.dcaExecutions).values({
      planId: g.planId,
      date: g.date,
      amount: Math.round(principal * 100) / 100,
      price: null,
      units: 0,
      notes: `Auto-TR: ${g.items} tx${g.items > 1 ? "s" : ""}`,
    });
    matched++;
  }

  return { matched };
}
