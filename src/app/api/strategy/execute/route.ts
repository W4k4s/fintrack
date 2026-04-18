import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { getEurPerUsd } from "@/lib/currency-rates";

// POST /api/strategy/execute
//
// Register a DCA buy with optimistic dashboard updates.
// For Trade Republic plans (where the real bank import lags days/weeks),
// creates pending ledger entries that reconcile when the CSV/PDF is imported.
//
// Flow:
// 1. Create dca_execution (always)
// 2. If broker = "Trade Republic":
//    a. Insert pending bank_transaction (debit=amount, status='pending')
//    b. Bump TR Securities asset.amount for the target symbol
//    c. Decrement TR Cash EUR asset.amount
// 3. If crypto plan (Binance will auto-sync):
//    Just create the dca_execution; the Binance syncExchange+matchTradesToDCA
//    will land the real trade + dedup this execution by (planId, date).

type ExecuteBody = {
  planId: number;
  amount: number;   // EUR
  price?: number;   // EUR per unit — optional; if missing, estimate from assets.currentPrice
  units?: number;   // if missing, compute from amount / price (or current price)
  notes?: string;
  date?: string;    // YYYY-MM-DD, defaults to today
};

const TR_ETF_SYMBOLS = new Set([
  "MSCI World", "MSCI Momentum", "Gold ETC", "EU Infl Bond", "MSFT", "SAN",
]);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExecuteBody;
    if (!body.planId || !body.amount || body.amount <= 0) {
      return NextResponse.json({ error: "planId and positive amount required" }, { status: 400 });
    }
    const date = body.date || new Date().toISOString().split("T")[0];

    const [plan] = await db.select().from(schema.investmentPlans)
      .where(eq(schema.investmentPlans.id, body.planId)).limit(1);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const isTradeRepublic = plan.broker === "Trade Republic"
      || TR_ETF_SYMBOLS.has(plan.asset);

    // Determine units for this buy (EUR amount / price per unit in EUR).
    const eurRate = await getEurPerUsd();
    let units = body.units;
    let priceEur = body.price;

    if (!units) {
      // Look up currentPrice (stored in USD); convert to EUR if we don't have explicit price.
      if (!priceEur) {
        const assetRows = await db.select().from(schema.assets)
          .where(eq(schema.assets.symbol, plan.asset));
        const anyWithPrice = assetRows.find(a => a.currentPrice);
        if (anyWithPrice?.currentPrice) {
          priceEur = anyWithPrice.currentPrice * eurRate;
        }
      }
      if (priceEur && priceEur > 0) {
        units = body.amount / priceEur;
      }
    }

    // 1. dca_execution
    const [exec] = await db.insert(schema.dcaExecutions).values({
      planId: plan.id,
      amount: Math.round(body.amount * 100) / 100,
      price: priceEur ? Math.round(priceEur * 100) / 100 : null,
      units: units ? Math.round(units * 1e8) / 1e8 : null,
      date,
      notes: body.notes || `Manual via /strategy${isTradeRepublic ? " (pending TR import)" : ""}`,
    }).returning();

    const summary: Record<string, unknown> = {
      execution: exec,
      pendingBankTxId: null as number | null,
      assetBumped: false,
      cashDecremented: false,
    };

    if (isTradeRepublic) {
      // 2a. Pending bank_transaction
      const [tr] = await db.select().from(schema.exchanges)
        .where(eq(schema.exchanges.slug, "trade-republic")).limit(1);
      const trAccounts = tr ? await db.select().from(schema.accounts)
        .where(eq(schema.accounts.exchangeId, tr.id)) : [];
      const trCash = trAccounts.find(a => a.name === "Cash");
      const trSecurities = trAccounts.find(a => a.name === "Securities");

      // Last confirmed balance (to project the pending one)
      const [latest] = await db.select()
        .from(schema.bankTransactions)
        .where(and(
          eq(schema.bankTransactions.source, "trade-republic"),
          eq(schema.bankTransactions.status, "confirmed"),
        ))
        .orderBy(desc(schema.bankTransactions.date), desc(schema.bankTransactions.id))
        .limit(1);
      const projectedBalance = latest?.balance != null
        ? Math.round((latest.balance - body.amount) * 100) / 100
        : null;

      const [pending] = await db.insert(schema.bankTransactions).values({
        source: "trade-republic",
        date,
        type: "trade",
        description: `[PENDING] Buy ${plan.asset} €${body.amount.toFixed(2)}`,
        credit: null,
        debit: body.amount,
        balance: projectedBalance,
        currency: "EUR",
        status: "pending",
        planId: plan.id,
      }).returning();
      summary.pendingBankTxId = pending.id;

      // 2b. Bump assets.amount in TR Securities for this symbol
      if (trSecurities && units && units > 0) {
        const [assetRow] = await db.select().from(schema.assets)
          .where(and(
            eq(schema.assets.accountId, trSecurities.id),
            eq(schema.assets.symbol, plan.asset),
          )).limit(1);
        if (assetRow) {
          await db.update(schema.assets)
            .set({
              amount: assetRow.amount + units,
              lastUpdated: new Date().toISOString(),
            })
            .where(eq(schema.assets.id, assetRow.id));
        } else if (priceEur) {
          // Create asset row so it appears on the dashboard. currentPrice stored in USD.
          await db.insert(schema.assets).values({
            accountId: trSecurities.id,
            symbol: plan.asset,
            amount: units,
            currentPrice: priceEur / eurRate,
            lastUpdated: new Date().toISOString(),
          });
        }
        summary.assetBumped = true;
      }

      // 2c. Decrement TR Cash EUR
      if (trCash) {
        const [cashAsset] = await db.select().from(schema.assets)
          .where(and(
            eq(schema.assets.accountId, trCash.id),
            eq(schema.assets.symbol, "EUR"),
          )).limit(1);
        if (cashAsset) {
          await db.update(schema.assets)
            .set({
              amount: Math.max(0, cashAsset.amount - body.amount),
              lastUpdated: new Date().toISOString(),
            })
            .where(eq(schema.assets.id, cashAsset.id));
          summary.cashDecremented = true;
        }
      }
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error("strategy/execute error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
