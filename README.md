# FinTrack 📊

Personal finance dashboard that aggregates crypto exchanges, brokers, and bank accounts into a single view.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![SQLite](https://img.shields.io/badge/SQLite-Drizzle_ORM-green)

## Features

- **Multi-source aggregation** — Crypto exchanges (API), brokers (PDF/CSV), and banks (XLS/CSV) in one place
- **Live prices** — Auto-refresh from CoinGecko (crypto) and Yahoo Finance (stocks/ETFs)
- **Portfolio vs Banking** — Investments tracked separately from daily spending accounts
- **Net Worth breakdown** — See exactly where your money is across all accounts
- **Smart expense tracking** — Auto-detects internal transfers between your own accounts
- **Asset detail pages** — Price charts, trade history, exchange breakdown, ISIN/ticker identifiers
- **Strategy dashboard** — Target allocation by sub-class (Core+Satellite V2), goals, DCA plans, weekly schedule with adaptive multipliers (F&G, funding, VIX) policy-aware, watchlist card, executed-vs-target progress
- **Strategy policies (SSOT)** — Narrative (tagline, philosophy), crypto transition policy (pause thresholds), F&G multiplier policy (threshold + allowed assets + crypto allocation gate) and thematic policy (max position, max open) live in `strategy_profiles.policies_json` and drive both UI and detectors. Edit via the profile modal, no SQL needed
- **DCA execute flow** — One-click "Comprar" with optimistic ledger updates, auto-reconciled with Binance sync or Trade Republic import
- **Intel engine** — 13 rule-based detectors (price dips, F&G regime, funding stress, macro calendar, news, drift, tax harvest, concentration, correlation, DCA pending, profile review, opportunity, thesis watch) persist signals and spawn Claude analysis for medium+ severity events
- **Research drawer** — Start a research dossier on any ticker; a Claude agent collects technicals + fundamentals + correlation + news and emits a verdict. Promote to watchlist with thesis + entry/target/stop/horizon. `thesis_watch` then guards stops and targets automatically (SOFT — emits signals, never places broker orders)
- **Telegram digests** — Weekly digest (Sun 19:00 Madrid) and daily pre-open briefing (Mon–Fri 08:30 Madrid)
- **Rebalance orders** — Executable checklist with auto-match against real trades, partial execution, 14-day expiry
- **Intel metrics** — Hit-rate and ROI per scope (rolling windows) + auto-cooldown feedback
- **Currency toggle** — USD or EUR with live exchange rates
- **Dark theme** — Clean, minimal UI

## Account Categories

| Category | Examples | Connection | Counted in |
|----------|----------|------------|------------|
| **Exchange** | Binance, KuCoin, MEXC | API auto-sync | Portfolio |
| **Broker** | Trade Republic, DEGIRO | PDF/CSV import | Portfolio |
| **Bank** | ING, Revolut, N26 | XLS/CSV import | Banking |
| **Wallet** | Ledger, MetaMask | Manual | Portfolio |

**Net Worth** = Portfolio + Banking

- **Portfolio** — Assets earning returns (crypto, ETFs, stocks, broker cash)
- **Banking** — Daily spending accounts (salary in, expenses out)

## Supported Integrations

| Service | Type | Connection | Balances | History | Guide |
|---------|------|-----------|----------|---------|-------|
| Binance | Exchange | API key | ✅ Auto | ✅ Up to 1 year | — |
| KuCoin | Exchange | API key | ✅ Auto | ⚠️ Limited (CSV recommended) | — |
| MEXC | Exchange | API key | ✅ Auto | ⚠️ Limited (7-day windows) | — |
| Trade Republic | Broker | PDF import | ✅ | ✅ Full | [Guide](docs/TRADE-REPUBLIC-IMPORT.md) |
| ING Direct (Spain) | Bank | XLS import | ✅ | ✅ Full | [Guide](docs/ING-IMPORT.md) |

## Pages

| Route | Description |
|-------|-------------|
| `/` | **Dashboard** — Net Worth, Portfolio, Banking boxes + allocation chart + top holdings |
| `/exchanges` | **Accounts** — Add/manage exchanges, brokers, banks & wallets (grouped by category) |
| `/exchanges/[id]` | **Account detail** — Holdings, import, trade history. Banks show sub-accounts with transactions |
| `/net-worth` | **Net Worth breakdown** — Where your money is, by account and category |
| `/assets` | **All assets** — Grouped list with current values |
| `/assets/[symbol]` | **Asset detail** — 30d price chart, trades, exchange breakdown |
| `/expenses` | **Expenses** — Income vs expenses with smart internal transfer detection |
| `/transactions` | **Transactions** — All trades across exchanges |
| `/plans` | **DCA Plans** — Recurring investment tracking |
| `/strategy` | **Strategy** — Profile, sub-class targets, goals, weekly DCA schedule with policy-aware multiplier, Watchlist card, rebalance suggestions |
| `/strategy/guide` | **Strategy guide** — Tagline + philosophy from profile, Core/Satellite breakdown, DCA + F&G bands (policy-aware), Sistema Intel explainer |
| `/intel` | **Intel feed** — Signals list with severity, status, scope filters |
| `/intel/[id]` | **Signal detail** — Plain-language analysis, re-analyze button, linked rebalance orders / news items |
| `/intel/research` | **Research drawer** — List of tracked tickers across states (researching/shortlisted/watching/open_position/closed) with dossiers and actions |
| `/intel/research/[id]` | **Dossier detail** — Claude verdict, technicals, fundamentals, correlation, news, promote/archive actions |
| `/intel/tracked/[id]` | **Thesis editor** — Edit entry/target/stop/horizon + open/close position from watching or open_position |
| `/intel/news` | **News panel** — Curated RSS items scored by keywords, tier, asset, recency |
| `/intel/metrics` | **Intel metrics** — Hit-rate and ROI per scope with selectable window |
| `/settings` | **Settings** — Configuration |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
git clone https://github.com/W4k4s/fintrack.git
cd fintrack
pnpm install

# Configure encryption key for API key storage
cp .env.example .env.local
# Edit .env.local: ENCRYPTION_KEY=$(openssl rand -hex 32)

pnpm db:push   # Run database migrations
pnpm dev       # Start dev server at http://localhost:3000
```

### Network Access

```bash
npx next dev -H 0.0.0.0 -p 3000
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, Recharts |
| Backend | Next.js API routes, Drizzle ORM |
| Database | SQLite (local file) |
| Exchanges | CCXT (Binance, KuCoin, MEXC) |
| Prices | CoinGecko (crypto), Yahoo Finance (stocks/ETFs) |
| PDF parsing | pdf-parse (Trade Republic) |
| XLS parsing | xlsx/SheetJS (ING Direct) |
| Security | AES-256-GCM encryption for API keys at rest |

## API Reference

### Core
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assets` | GET | All assets with aggregated values |
| `/api/assets/[symbol]` | GET | Asset detail with price history and trades |
| `/api/prices` | POST | Refresh all asset prices |
| `/api/currency` | GET | EUR/USD exchange rate |

### Accounts
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/exchanges` | GET/POST/DELETE | Manage accounts (exchanges, brokers, banks) |
| `/api/exchanges/[id]/detail` | GET | Account detail with assets |
| `/api/exchanges/[id]/sync` | POST | Sync balances via API |
| `/api/exchanges/[id]/trades` | GET/POST | Get/sync trade history |
| `/api/bank-accounts` | GET/PATCH | List/rename bank sub-accounts |
| `/api/bank-accounts/transactions` | GET | Paginated transactions per bank account |

### Import
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/import/trade-republic` | POST | Parse Trade Republic PDFs |
| `/api/import/trade-republic/confirm` | POST | Confirm TR import |
| `/api/import/ing` | POST | Import ING XLS (`action=preview\|import`) |

### Dashboard
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/summary` | GET | Portfolio vs Banking totals + portfolio assets |
| `/api/net-worth` | GET | Full breakdown by account with sub-accounts |
| `/api/expenses` | GET | Expenses with internal transfer detection |
| `/api/portfolio/snapshot` | GET/POST | Portfolio value over time |

### Strategy
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/strategy` | GET/PUT | Profile + goals + plans + executions (seeds defaults on first call). PUT validates new R1 fields (tagline, philosophy, policiesJson, monthlyFixedExpenses) and syncs the emergency_fund goal when expenses/months change |
| `/api/strategy/sub-targets` | GET/PUT | Sub-class allocation (9 V2 classes). PUT recomputes the flat target columns to preserve the `sum(sub where parent=X) == target_X_flat` invariant |
| `/api/strategy/goals` | GET/POST/PATCH/DELETE | Manage goals |
| `/api/strategy/schedule` | GET | Weekly schedule derived from monthly plans with policy-aware multiplier. Components expose `gated: "crypto_paused" \| "asset_not_in_scope"` when the policy overrides F&G |
| `/api/strategy/execute` | POST | Register DCA buy with optimistic ledger updates (TR pending bank_transaction + asset bump; Binance auto-matches on next sync) |
| `/api/strategy/executions` | GET/DELETE | DCA execution log |
| `/api/strategy/market` | GET | Market context (F&G, prices, funding) with the policy-gated DCA multiplier label |
| `/api/strategy/alerts` | GET | Strategy-level alerts surfaced on `/strategy` |
| `/api/strategy/health` | GET | Emergency fund (= `monthlyFixedExpenses × emergencyMonths`) + savings-rate health check |

### Intel
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/intel` | GET | List signals (filters: severity, scope, status, limit) + unread count |
| `/api/intel/[id]` | GET/PATCH | Signal detail / update userStatus (read, acted, dismissed, snoozed) |
| `/api/intel/[id]/reanalyze` | POST | Re-spawn Claude analysis for a signal |
| `/api/intel/tick` | POST | Run detectors (`?scope=<scope\|all>`), persist new signals, spawn Claude for ≥med, apply cooldowns and retention |
| `/api/intel/research` | GET/POST | List tracked assets / open new research. POST spawns an async Claude worker that writes the dossier |
| `/api/intel/research/[id]` | GET/PATCH/POST | Dossier detail; PATCH edits thesis fields; POST with `action=promote_watching\|promote_open\|close_position\|archive\|retry` drives the state machine |
| `/api/intel/research/price` | GET | Spot price for a ticker (Yahoo/CoinGecko), used by the Watchlist card |
| `/api/intel/news` | GET/POST | Fetch/score RSS news items |
| `/api/intel/orders/[id]` | PATCH | Update a rebalance order (done/partial/skipped) |
| `/api/intel/tax-harvest/preview` | GET | Preview tax-loss harvesting candidates |
| `/api/intel/metrics` | GET | Hit-rate + ROI by scope (`?windowDays=1..90`) |
| `/api/intel/digest-weekly` | POST | Send weekly Telegram digest (Sun 19:00 Madrid) |
| `/api/intel/digest-daily` | POST | Send daily pre-open briefing (Mon–Fri 08:30 Madrid) |

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plans` | GET/POST | DCA plans |
| `/api/transactions` | GET | All transactions across exchanges |
| `/api/sync-all` | POST | Sync all auto exchanges (30s cooldown, `{force:true}` to bypass) |

## Import Guides

- **[Trade Republic](docs/TRADE-REPUBLIC-IMPORT.md)** — PDF import for securities, crypto, and bank statements
- **[ING Direct Spain](docs/ING-IMPORT.md)** — XLS import with deduplication and internal transfer detection

## Architecture notes

- **[Currency normalization](docs/CURRENCY-NORMALIZATION.md)** — Values are stored in USD; transactions carry their quote currency and are converted at display time
- **[DCA execution](docs/DCA-EXECUTION.md)** — Optimistic dashboard updates when you click "Comprar" on `/strategy`, reconciled on the next Trade Republic import
- **[Strategy dashboard spec](STRATEGY-DASHBOARD-SPEC.md)** — Target allocation, weekly schedule, adaptive multiplier, goals, rebalance suggestions

### Strategy V2 single source of truth

The strategy profile doubles as the narrative + policy config for both UI and detectors. Columns in `strategy_profiles`:

- `tagline`, `philosophy` — rendered directly by `/strategy/guide`.
- `monthly_fixed_expenses` — drives the emergency-fund target (`× emergency_months`); the goal row is recomputed on PUT.
- `policies_json` — structured blob defined in `src/lib/strategy/policies.ts`:
  ```
  { crypto:    { pauseAbovePct, btcOnlyBetween: [low, high], fullBelowPct },
    multiplier:{ fgThreshold, appliesTo: ["BTC", ...], requiresCryptoUnderPct },
    thematic:  { maxPositionPct, maxOpen, requireThesisFields: [...] } }
  ```
  Read via `parsePolicies()` (tolerant — falls back to `DEFAULT_POLICIES_V2` if corrupt). Written via the profile modal; PUT `/api/strategy` validates strictly with `validatePolicies()` and returns 400 on invalid shapes.
- Sub-class targets live in `strategy_sub_targets` (9 V2 classes). The 6 flat `target_*` columns on `strategy_profiles` are a derived cache — `recalcFlatFromSubTargets()` keeps them in sync after each sub-targets write.

The policy powers:
- `/api/strategy/market` — gates the DCA multiplier (returns `1.0` with a `Pausado (crypto X% ≥ threshold%)` label when the allocation threshold is hit).
- `/api/strategy/schedule` and `src/lib/intel/digest-weekly.ts` — call `multiplierFor(cls, asset, ctx, policies)` so the per-plan amounts respect the same gate.
- `src/lib/intel/claude-spawn.ts` — injects `profile.tagline` + `profile.philosophy` into the research prompt so Claude's context reflects the current strategy, not a hardcoded narrative.

One-shot helper for first-time adoption: `scripts/strategy-r1-apply.ts` (dry-run by default, `--apply` to execute) resets sub-targets to V2, removes the obsolete "bajar cash" goal, and backfills narrative/policies/emergencyMonths/monthlyFixedExpenses with guardrails + automatic DB backup.

### Intel detectors

The Intel engine ships with 13 detectors that run on every `POST /api/intel/tick` (scheduled externally). Each persists dedup-keyed signals and spawns a Claude analysis for severity ≥ `med`.

| Scope | What it detects |
|-------|----------------|
| `price_dip` / `price_surge` | Significant moves on held assets |
| `fg_regime` | Fear & Greed regime transitions |
| `funding_anomaly` | Perp funding stress (Binance BTC/ETH) |
| `news` | Scored RSS items (keyword + tier + asset + recency) |
| `macro_event` | High-impact macro calendar (ForexFactory) |
| `drift` | Allocation drift vs target → executable rebalance plan with orders, IRPF-aware, dual-venue |
| `tax_harvest` | Tax-loss harvesting window (Oct–Dec, Spain IRPF) |
| `dca_pending` | Week's DCA target not yet executed |
| `profile_review` | Profile 2 quarters outside bands → review prompt |
| `concentration_risk` | Top-N share + HHI breach |
| `correlation_risk` | Intra-crypto rolling 30d correlation |
| `opportunity` | Watchlist ticker enters entry window / RSI oversold / sub-class underweight / near catalyst |
| `thesis_*` (4 sub-scopes) | On open positions: `thesis_stop_hit` (critical), `thesis_target_hit` (high), `thesis_near_stop` (med), `thesis_expired` (med). Stops are SOFT — emit signals, never place broker orders |

Rebalance orders auto-match against real trades (Binance/TR), support partial execution, and expire after 14 days. Metrics endpoint tracks hit-rate and ROI per scope with auto-cooldown feedback.

## Security

- API keys encrypted at rest (AES-256-GCM)
- Encryption key in `.env.local` (never committed)
- Database file excluded from git
- Read-only API keys recommended — never grant trading/withdrawal permissions

## License

MIT
