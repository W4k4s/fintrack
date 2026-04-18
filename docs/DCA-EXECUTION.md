# DCA Execution — Optimistic updates + bank reconciliation

When you make a DCA buy on a broker that doesn't have live API sync
(Trade Republic), the gap between the purchase and the bank-statement
import used to leave the dashboard stale for days.

This doc describes how FinTrack closes that gap.

## The flow

1. **You click `Comprar` on `/strategy`.**
   The modal's `Manual` tab accepts amount (EUR), optional unit price,
   and notes. It submits to `POST /api/strategy/execute`.

2. **The server writes an optimistic ledger entry.**
   For plans whose `broker = "Trade Republic"` (or whose asset is a
   known TR security: MSCI World, MSCI Momentum, Gold ETC, EU Infl
   Bond, …):

   - `dca_executions` — a new row in EUR (visible in the weekly
     shopping list as "Hecho").
   - `bank_transactions` — a pending row (`status = 'pending'`) with
     `debit = amount`, description `[PENDING] Buy <asset> €<amount>`,
     balance projected from the latest confirmed TR balance minus the
     amount. Linked to the plan via `plan_id`.
   - `assets` bump — the TR `Securities` asset for the target symbol
     gains `amount / priceEur` units (price taken from
     `assets.currentPrice`, converted to EUR with the live rate). The
     TR `Cash` EUR asset loses `amount`.

   For plans on Binance (crypto), only the `dca_execution` is written;
   the normal sync + `matchTradesToDCA` flow will pick up the real
   trade within minutes.

3. **Dashboard reacts immediately.**
   `/api/dashboard/summary` reads `assets`, which has been nudged, so
   Portfolio goes up, Banking (EUR cash) goes down. No refresh trick
   needed.

4. **You import the TR statement days/weeks later.**
   `POST /api/import/trade-republic/confirm` now does two things
   before inserting the authoritative rows:

   - Computes `maxImportDate` from the incoming transactions.
   - Deletes every `bank_transactions` row with
     `source = 'trade-republic'`, `status = 'pending'`, and
     `date ≤ maxImportDate`. The response includes
     `pendingReconciled: N`.

   Then the real bank rows are inserted, and the assets/cash rows are
   delete+reinserted from the import payload — which means the
   optimistic amounts from step 2 are cleanly replaced by the
   authoritative ones. No double-counting.

## Schema changes

```sql
ALTER TABLE bank_transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE bank_transactions ADD COLUMN plan_id INTEGER REFERENCES investment_plans(id);
```

- `status`: `'confirmed'` (authoritative, from an import) or
  `'pending'` (optimistic, awaiting reconciliation).
- `plan_id`: links a pending row back to its DCA plan so the UI can
  attribute it later.

## Edge cases

- **Pending never reconciled.** If a TR import never covers a pending
  row's date, it stays as `pending` forever. There's no alert yet —
  add a check on `pending.date < today - 14d` if it becomes an issue.
- **User undoes a buy.** Delete the `dca_execution` (DELETE endpoint
  exists). The pending `bank_transaction` and asset bumps are not
  rolled back automatically — this is a one-way optimistic write for
  now. Re-importing TR will restore the correct state anyway.
- **Buying an asset not yet in the portfolio.** The endpoint creates
  the `assets` row on the fly in the TR Securities account with
  `currentPrice` derived from the provided EUR price.

## Related files

- `src/app/api/strategy/execute/route.ts` — optimistic write
- `src/app/api/import/trade-republic/confirm/route.ts` — reconciliation
- `src/lib/db/schema.ts` — `status`/`plan_id` columns
- `src/app/strategy/page.tsx` — `handleExecuteDCA` wiring
