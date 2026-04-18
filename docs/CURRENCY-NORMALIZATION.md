# Currency normalization

Every monetary value in FinTrack is **stored in USD** and converted to
the user's selected currency at display time. This doc explains why,
how, and what changed when USDC-quoted Binance trades exposed a bug in
April 2026.

## The principle

- `assets.currentPrice` is USD.
- `assets.avgBuyPrice` is USD.
- `transactions.price`, `transactions.total` are in **the trade's
  quote currency** (USDC, USDT, EUR, …). The column
  `transactions.quote_currency` says which one.
- `dca_executions.amount` is EUR (it feeds the "this month / this
  week" strategy numbers, which are always EUR-denominated).
- `bank_transactions.credit/debit/balance` are in
  `bank_transactions.currency` (EUR for Trade Republic and ING).

When rendering, the client uses `useCurrency()`:

- `format(usd)` / `convert(usd)` — legacy helpers, assume the input is
  already USD.
- `formatFrom(amount, sourceCurrency)` /
  `convertFrom(amount, sourceCurrency)` — for values read straight out
  of `transactions`. They normalize the source to USD first, then
  apply the display rate.

USD-pegged stablecoins — `USDT`, `USDC`, `BUSD`, `FDUSD`, `TUSD`,
`DAI` — are treated as 1:1 with USD.

## The bug we fixed

Before the fix, `transactions` had no `quote_currency` column. The
whole app assumed every row was in USD, but the three views that show
trades (`/transactions`, `/exchanges/[id]`, `/assets/[symbol]`
exchange-trades section) hardcoded either a `$` or a `€` prefix and
**never converted**. A Binance BTC/USDC trade of $90 would render as
`€89.98` — the raw USDC value with a euro sign glued on top.

A second bug in `dca-matcher.ts` summed `transactions.total` (USDC)
directly into `dca_executions.amount` ("EUR spent"), inflating the
"este mes" counters on `/strategy` by ~18%.

## What changed

### Schema

```sql
ALTER TABLE transactions ADD COLUMN quote_currency TEXT NOT NULL DEFAULT 'USD';
```

### Parsers / syncs save the quote

- `csv-parsers.ts` — `CsvTrade.quoteCurrency` added; Binance/KuCoin/
  MEXC parsers populate it from the pair split (`BTCUSDC` → `USDC`).
- `src/lib/exchanges/index.ts` (`syncExchange`) and
  `src/app/api/exchanges/[id]/trades/route.ts` — derive quote from
  `trade.pair.split("/")[1]`.

### Display

Three views now call `formatFrom(value, tx.quoteCurrency)` instead of
`$` or `formatCurrency(value)`:

- `src/app/transactions/page.tsx`
- `src/app/exchanges/[id]/page.tsx` (Trade History table)
- `src/app/assets/[symbol]/page.tsx` (Exchange Trades table)

### DCA matcher

`src/lib/dca-matcher.ts` now converts each aggregated trade total to
EUR using `quote_currency` + live USD/EUR rate before writing
`dca_executions.amount`. Stablecoins get the current rate; EUR trades
pass through unchanged.

### Server-side rate helper

`src/lib/currency-rates.ts` — `getRates()`, `getEurPerUsd()`,
`usdToEur()`. Caches the exchangerate-api response for 1h. Used by the
matcher and by the `/api/strategy/health` + `/api/strategy/market`
endpoints that previously hardcoded `* 0.867`.

### One-shot backfill

`scripts/backfill-dca-eur.mjs` rebuilt `dca_executions` for auto-sync
rows using current rates. Run once after deploying the schema change.

## Related files

- `src/lib/db/schema.ts`
- `src/components/currency-provider.tsx`
- `src/lib/currency-rates.ts`
- `src/lib/csv-parsers.ts`
- `src/lib/dca-matcher.ts`
- `src/lib/exchanges/index.ts`
- `src/app/api/{transactions,assets/[symbol],exchanges/[id]/trades,exchanges/[id]/import-csv}/route.ts`
- `src/app/api/strategy/{health,market}/route.ts`
- `src/app/{transactions,exchanges/[id]/page.tsx,assets/[symbol]/page.tsx,strategy}/page.tsx`
- `scripts/backfill-dca-eur.mjs`
