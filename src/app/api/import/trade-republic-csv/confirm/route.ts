import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchanges, accounts, assets, bankTransactions } from "@/lib/db/schema";
import { eq, and, lte, gte, isNull } from "drizzle-orm";
import { recomputeTrSecuritiesAvgBuy } from "@/lib/assets/cost-basis";
import { ISIN_MAP } from "@/lib/isin-map";
import {
  tryAutoMatchOrdersBatch,
  type MatchableTransaction,
} from "@/lib/intel/rebalance/order-matcher";
import { notifyAutoMatched } from "@/lib/intel/rebalance/auto-match-notifier";
import { matchTrTradesToDCA, type TrTradeForDca } from "@/lib/dca-matcher";

interface CsvSecurityPayload {
  symbol: string;
  name: string;
  isin: string;
  quantity: number;
  priceEur: number;
  valueEur: number;
}
interface CsvCryptoPayload {
  symbol: string;
  quantity: number;
  priceEur: number;
  costEur: number;
  valueEur: number;
}
interface CsvTxPayload {
  date: string;
  type: string;
  description: string;
  credit: number | null;
  debit: number | null;
  balance: number;
  externalId: string;
}
interface CsvTradePayload {
  date: string;
  side: "buy" | "sell";
  symbol: string;
  principalEur: number;
  feeEur: number;
  units: number;
  priceEur: number;
}

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as {
      securities?: CsvSecurityPayload[];
      crypto?: CsvCryptoPayload[];
      cashBalance?: number;
      transactions?: CsvTxPayload[];
      trades?: CsvTradePayload[];
    };
    const { securities, crypto, cashBalance, transactions, trades } = data;

    // EUR → USD (la DB guarda currentPrice en USD).
    const ratesRes = await fetch("http://localhost:3000/api/currency");
    const rates = await ratesRes.json();
    const eurToUsd = 1 / (rates.EUR || 0.92);

    let [exchange] = await db
      .select()
      .from(exchanges)
      .where(eq(exchanges.slug, "trade-republic"));
    if (!exchange) {
      const [inserted] = await db
        .insert(exchanges)
        .values({
          name: "Trade Republic",
          slug: "trade-republic",
          type: "manual",
          enabled: true,
        })
        .returning();
      exchange = inserted;
    }

    const accountTypes = [
      { name: "Securities", type: "spot" as const },
      { name: "Crypto", type: "spot" as const },
      { name: "Cash", type: "manual" as const },
    ];
    const acctMap: Record<string, number> = {};
    for (const at of accountTypes) {
      let [acct] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.exchangeId, exchange.id), eq(accounts.name, at.name)));
      if (!acct) {
        const [inserted] = await db
          .insert(accounts)
          .values({
            exchangeId: exchange.id,
            name: at.name,
            type: at.type,
            currency: "EUR",
          })
          .returning();
        acct = inserted;
      }
      acctMap[at.name] = acct.id;
    }

    if (securities?.length) {
      await db.delete(assets).where(eq(assets.accountId, acctMap.Securities));
    }
    if (crypto?.length) {
      await db.delete(assets).where(eq(assets.accountId, acctMap.Crypto));
    }
    if (cashBalance != null) {
      await db.delete(assets).where(eq(assets.accountId, acctMap.Cash));
    }

    if (securities?.length) {
      for (const s of securities) {
        await db.insert(assets).values({
          accountId: acctMap.Securities,
          symbol: s.symbol,
          amount: s.quantity,
          currentPrice: s.priceEur * eurToUsd,
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    if (crypto?.length) {
      for (const c of crypto) {
        await db.insert(assets).values({
          accountId: acctMap.Crypto,
          symbol: c.symbol,
          amount: c.quantity,
          avgBuyPrice: c.costEur ? (c.costEur / c.quantity) * eurToUsd : undefined,
          currentPrice: c.priceEur * eurToUsd,
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    if (cashBalance != null) {
      await db.insert(assets).values({
        accountId: acctMap.Cash,
        symbol: "EUR",
        amount: cashBalance,
        currentPrice: eurToUsd,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Reconcile pendings (mismo patrón que el PDF confirm).
    let pendingReconciled = 0;
    // Legacy PDF cleanup: el CSV es canónico y superset del histórico PDF en su
    // rango. Borra bank_transactions TR sin external_id (imports PDF antiguos)
    // que caen dentro del rango del CSV para evitar doble conteo.
    let legacyCleaned = 0;
    if (transactions?.length) {
      const maxDate = transactions.reduce(
        (max, tx) => (tx.date > max ? tx.date : max),
        "",
      );
      const minDate = transactions.reduce(
        (min, tx) => (min === "" || tx.date < min ? tx.date : min),
        "",
      );
      if (maxDate) {
        const deleted = await db
          .delete(bankTransactions)
          .where(
            and(
              eq(bankTransactions.source, "trade-republic"),
              eq(bankTransactions.status, "pending"),
              lte(bankTransactions.date, maxDate),
            ),
          )
          .returning();
        pendingReconciled = deleted.length;
      }
      if (minDate && maxDate) {
        const cleaned = await db
          .delete(bankTransactions)
          .where(
            and(
              eq(bankTransactions.source, "trade-republic"),
              isNull(bankTransactions.externalId),
              gte(bankTransactions.date, minDate),
              lte(bankTransactions.date, maxDate),
            ),
          )
          .returning();
        legacyCleaned = cleaned.length;
      }
    }

    // Dedup por externalId (UUID TR). El índice UNIQUE parcial evita colisiones.
    let txInserted = 0;
    let txSkipped = 0;
    if (transactions?.length) {
      const existing = await db
        .select({ externalId: bankTransactions.externalId })
        .from(bankTransactions)
        .where(eq(bankTransactions.source, "trade-republic"));
      const existingIds = new Set(
        existing.map((e) => e.externalId).filter((x): x is string => Boolean(x)),
      );

      for (const tx of transactions) {
        if (tx.externalId && existingIds.has(tx.externalId)) {
          txSkipped++;
          continue;
        }
        try {
          await db.insert(bankTransactions).values({
            source: "trade-republic",
            date: tx.date,
            type: tx.type,
            description: tx.description,
            credit: tx.credit,
            debit: tx.debit,
            balance: tx.balance,
            currency: "EUR",
            externalId: tx.externalId || null,
          });
          txInserted++;
        } catch (err) {
          // Colisión del índice unique → ya existe (race o reintento).
          txSkipped++;
          console.warn("[tr-csv] insert skipped", tx.externalId, err);
        }
      }
    }

    try {
      await recomputeTrSecuritiesAvgBuy();
    } catch (err) {
      console.error("[tr-csv] recomputeTrSecuritiesAvgBuy failed", err);
    }

    // TR → DCA executions: principal (sin fees) por plan+date. El WeeklyShoppingList
    // se alimenta de dca_executions; los targets son en principal.
    let dcaMatched = 0;
    try {
      const forDca: TrTradeForDca[] = (trades || []).map((t) => ({
        date: t.date,
        side: t.side,
        symbol: t.symbol,
        principalEur: t.principalEur,
        feeEur: t.feeEur,
        units: t.units,
        priceEur: t.priceEur,
      }));
      const r = await matchTrTradesToDCA(forDca);
      dcaMatched = r.matched;
    } catch (err) {
      console.error("[tr-csv] matchTrTradesToDCA failed", err);
    }

    // Auto-match órdenes: ISIN viene en la description que armó el parser.
    try {
      const trades = (transactions || []).filter((tx) => tx.type === "trade");
      const isinRegex = /(Buy|Sell)\s+trade\s+([A-Z]{2}[A-Z0-9]{10})/i;
      const matchable: MatchableTransaction[] = [];
      for (const tx of trades) {
        const m = tx.description.match(isinRegex);
        if (!m) continue;
        const side = m[1].toLowerCase() === "sell" ? "sell" : "buy";
        const symbol = ISIN_MAP[m[2]];
        if (!symbol) continue;
        const amountEur = Math.abs(Number(tx.debit ?? 0) - Number(tx.credit ?? 0));
        if (!Number.isFinite(amountEur) || amountEur <= 0) continue;
        matchable.push({
          symbol,
          venue: "trade-republic",
          type: side,
          amountEur,
          date: tx.date,
        });
      }
      if (matchable.length > 0) {
        const { matched, ambiguous } = await tryAutoMatchOrdersBatch(matchable);
        await notifyAutoMatched(matched, ambiguous, "import Trade Republic CSV");
      }
    } catch (err) {
      console.error("[tr-csv] auto-match orders failed", err);
    }

    await db
      .update(exchanges)
      .set({ lastSync: new Date().toISOString() })
      .where(eq(exchanges.id, exchange.id));

    return NextResponse.json({
      success: true,
      imported: {
        securities: securities?.length || 0,
        crypto: crypto?.length || 0,
        cash: cashBalance != null ? 1 : 0,
        transactions: transactions?.length || 0,
        transactionsInserted: txInserted,
        transactionsSkipped: txSkipped,
        pendingReconciled,
        legacyPdfCleaned: legacyCleaned,
        dcaExecutionsCreated: dcaMatched,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
