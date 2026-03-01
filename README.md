# FinTrack 📊

Personal portfolio tracker that aggregates crypto exchanges, bank accounts, and securities into a single dashboard.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![SQLite](https://img.shields.io/badge/SQLite-Drizzle_ORM-green)

## Features

- **Multi-exchange support** — Connect Binance, KuCoin, MEXC (via API keys) and Trade Republic (via PDF import)
- **Live price updates** — Auto-refresh prices from CoinGecko (crypto) and Yahoo Finance (stocks/ETFs)
- **Asset detail pages** — Price charts (30d), trade history, exchange breakdown, ISIN/ticker identifiers
- **Trade history sync** — Fetch trade history from exchanges via CCXT
- **PDF import** — Parse Trade Republic bank statements, securities, and crypto statements
- **CSV import** — Import trade history from exchange CSV exports (for exchanges with limited API history)
- **DCA plans** — Track dollar-cost averaging plans
- **Expense tracking** — Categorize bank transactions
- **Portfolio snapshots** — Track total portfolio value over time
- **Currency toggle** — View values in USD or EUR with live exchange rates
- **Dark theme** — Clean, minimal dark UI

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS + Recharts
- **Backend**: Next.js API routes + Drizzle ORM + SQLite
- **Exchange integration**: CCXT (Binance, KuCoin, MEXC)
- **Price feeds**: CoinGecko (crypto), Yahoo Finance (stocks/ETFs)
- **PDF parsing**: pdf-parse (Trade Republic documents)
- **Security**: AES-256-GCM encryption for API keys at rest

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — portfolio overview, pie chart, top holdings |
| `/exchanges` | Connected exchanges — manage connections |
| `/exchanges/[id]` | Exchange detail — holdings, trade history, import, API limits |
| `/assets` | All assets — grouped list with values |
| `/assets/[symbol]` | Asset detail — price chart, trades, identifiers |
| `/plans` | DCA plans — recurring investment tracking |
| `/transactions` | Transaction history — all trades across exchanges |
| `/expenses` | Expense tracking — categorized bank transactions |
| `/settings` | Settings — configuration |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
# Clone
git clone https://github.com/W4k4s/fintrack.git
cd fintrack

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local and set ENCRYPTION_KEY (generate with: openssl rand -hex 32)

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Network Access

To access from other devices on your network:

```bash
npx next dev -H 0.0.0.0 -p 3000
```

## Exchange Support

| Exchange | Connection | Balances | Trade History | Notes |
|----------|-----------|----------|---------------|-------|
| **Binance** | API key | ✅ Auto-sync | ✅ Up to 1 year | Includes Earn positions |
| **KuCoin** | API key | ✅ Auto-sync | ⚠️ Limited | Recent trades only; CSV recommended |
| **MEXC** | API key | ✅ Auto-sync | ⚠️ Very limited | 7-day query windows; Convert trades not in API |
| **Trade Republic** | PDF import | ✅ Via PDF | ✅ Full via bank statement | Securities, crypto, bank transactions |

> **Tip**: For complete trade history on KuCoin/MEXC, export a CSV from the exchange website and import it via the exchange detail page.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assets` | GET | All assets with values |
| `/api/assets/[symbol]` | GET | Asset detail with price history and trades |
| `/api/exchanges` | GET/POST/DELETE | Manage exchanges |
| `/api/exchanges/[id]/sync` | POST | Sync balances from exchange |
| `/api/exchanges/[id]/trades` | GET/POST | Get/sync trade history |
| `/api/exchanges/[id]/detail` | GET | Exchange detail with assets |
| `/api/prices` | POST/GET | Refresh all asset prices |
| `/api/import/trade-republic` | POST | Parse TR PDFs |
| `/api/import/trade-republic/confirm` | POST | Confirm TR import |
| `/api/portfolio/snapshot` | GET/POST | Portfolio value snapshots |
| `/api/currency` | GET | EUR/USD exchange rate |
| `/api/plans` | GET/POST | DCA plans |
| `/api/transactions` | GET | All transactions |
| `/api/expenses` | GET | Bank transaction expenses |

## Security

- API keys are encrypted at rest with AES-256-GCM
- Encryption key stored in `.env.local` (never committed)
- Database file excluded from git
- Read-only API keys recommended (never grant trading/withdrawal permissions)

## License

MIT
