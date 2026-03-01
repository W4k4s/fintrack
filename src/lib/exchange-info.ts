export interface ExchangeLimits {
  tradeHistory: string;
  csvInstructions: string[];
  csvNote?: string;
  apiLimitations: string[];
}

export const EXCHANGE_LIMITS: Record<string, ExchangeLimits> = {
  binance: {
    tradeHistory: "Up to 1 year via API",
    apiLimitations: [
      "Trade history limited to ~1 year via API",
      "Earn/staking transactions may not appear in spot trades",
      "Converts (Quick Buy/Sell) are separate from spot orders",
    ],
    csvInstructions: [
      "Go to binance.com → Orders → Spot Orders → Trade History",
      "Click 'Export' in the top right corner",
      "Select the date range you want",
      "Choose 'CSV' format and download",
    ],
    csvNote: "CSV includes all spot trades with exact timestamps, prices, and fees.",
  },
  kucoin: {
    tradeHistory: "Limited — recent trades only",
    apiLimitations: [
      "fetchMyTrades returns only recent trades (days to weeks)",
      "Quick Buy/Convert trades don't appear in spot trade history",
      "Historical trades older than ~6 months may be unavailable",
    ],
    csvInstructions: [
      "Go to kucoin.com → Orders → Spot Orders → Trade History",
      "Click 'Export' button",
      "Select date range and confirm",
      "Download the CSV file",
    ],
    csvNote: "For complete history including Converts, also export from: Assets → Transaction History → Export.",
  },
  mexc: {
    tradeHistory: "Very limited — API restricted to 7-day windows",
    apiLimitations: [
      "Trade queries limited to 7-day windows per request",
      "Convert/Quick Buy transactions are NOT available via trade API",
      "Deposits/withdrawals also limited to 7-day query windows",
      "Most users' purchases are via Convert, which won't appear",
    ],
    csvInstructions: [
      "Go to mexc.com → Orders → Spot Orders → Trade History",
      "Click 'Export' in the top right",
      "Select the date range",
      "Download CSV",
      "Also check: Assets → Transaction History → Export (for converts)",
    ],
    csvNote: "If you used 'Quick Buy/Convert', export from Transaction History instead of Trade History.",
  },
  "trade-republic": {
    tradeHistory: "Full history via bank statement PDF",
    apiLimitations: [
      "Trade Republic doesn't offer a public API",
      "All data is imported via PDF documents from the app",
      "Bank statement covers all transactions (deposits, withdrawals, card payments, savings plan executions)",
    ],
    csvInstructions: [
      "Open the Trade Republic app",
      "Go to Profile → Documents",
      "Download: Extracto de Cuenta de Valores (securities)",
      "Download: Extracto de Criptomonedas (crypto holdings)",
      "Download: Estado de Cuenta (bank statement with all transactions)",
      "Upload all 3 PDFs here",
    ],
    csvNote: "Export one month at a time. Upload only new months going forward — duplicates are automatically skipped.",
  },
};
