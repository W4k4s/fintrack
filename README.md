# FinTrack

Personal finance dashboard — track crypto, stocks, and savings across all your accounts in one place.

## Features (planned)

- 📊 Unified dashboard with total portfolio balance
- 🔌 Plugin architecture for exchange connectors (Binance, KuCoin, Kraken, Coinbase, MEXC, and more)
- 📈 Historical portfolio tracking and performance charts
- 💰 Manual accounts for banks, brokers without APIs (Trade Republic, etc.)
- 📅 Investment plan tracking (DCA schedules, recurring buys)
- 📰 Market news and research feed
- 🔐 Local-first — your data stays on your machine
- 🌐 Self-hostable web app

## Tech Stack

- **Frontend:** Next.js 15 + React + Tailwind CSS + shadcn/ui
- **Backend:** Next.js API routes
- **Database:** SQLite (via Drizzle ORM)
- **Charts:** Recharts
- **Exchange APIs:** Modular adapter pattern

## Getting Started

```bash
git clone https://github.com/W4k4s/fintrack.git
cd fintrack
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Exchange Setup

On first run, the app guides you through connecting your accounts:

1. Go to Settings → Exchanges
2. Select your exchange
3. Enter your **read-only** API key and secret
4. FinTrack only needs read permissions — never enable trading/withdrawal

### Supported Exchanges

| Exchange | Auto-sync | Notes |
|----------|-----------|-------|
| Binance | ✅ | API key required |
| KuCoin | ✅ | API key + passphrase |
| MEXC | ✅ | API key required |
| Coinbase | ✅ | API key required |
| Kraken | ✅ | API key required |
| Bybit | ✅ | API key required |
| OKX | ✅ | API key + passphrase |
| Gate.io | ✅ | API key required |
| Bitget | ✅ | API key + passphrase |
| Crypto.com | ✅ | API key required |
| HTX (Huobi) | ✅ | API key required |
| Ledger/Hardware | 📝 | Manual or wallet address |
| Trade Republic | 📝 | Manual entry |
| Banks | 📝 | Manual entry |

## License

MIT
