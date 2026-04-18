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
- **DCA plans** — Track dollar-cost averaging strategies
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

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plans` | GET/POST | DCA plans |
| `/api/transactions` | GET | All transactions across exchanges |

## Import Guides

- **[Trade Republic](docs/TRADE-REPUBLIC-IMPORT.md)** — PDF import for securities, crypto, and bank statements
- **[ING Direct Spain](docs/ING-IMPORT.md)** — XLS import with deduplication and internal transfer detection

## Architecture notes

- **[Currency normalization](docs/CURRENCY-NORMALIZATION.md)** — Values are stored in USD; transactions carry their quote currency and are converted at display time
- **[DCA execution](docs/DCA-EXECUTION.md)** — Optimistic dashboard updates when you click "Comprar" on `/strategy`, reconciled on the next Trade Republic import

## Security

- API keys encrypted at rest (AES-256-GCM)
- Encryption key in `.env.local` (never committed)
- Database file excluded from git
- Read-only API keys recommended — never grant trading/withdrawal permissions

## License

MIT
