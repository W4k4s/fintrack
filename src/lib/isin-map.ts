/**
 * Shared ISIN → Symbol mapping.
 * Used by both the TR parser and the asset detail page to match
 * bank transactions to assets.
 */
export const ISIN_MAP: Record<string, string> = {
  "IE00B4L5Y983": "MSCI World",
  "IE00B0M62X26": "EU Infl Bond",
  "IE00B579F325": "Gold ETC",
  "IE00BP3QZ825": "MSCI Momentum",
  "US5949181045": "MSFT",
  "US67066G1040": "NVDA",
  "ES0113900J37": "SAN",
  "XF000BTC0017": "BTC",
};

/** Reverse map: Symbol → ISIN(s) */
export const SYMBOL_ISINS: Record<string, string[]> = {};
for (const [isin, symbol] of Object.entries(ISIN_MAP)) {
  if (!SYMBOL_ISINS[symbol]) SYMBOL_ISINS[symbol] = [];
  SYMBOL_ISINS[symbol].push(isin);
}

/** CoinGecko ID mapping for crypto price charts */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  PEPE: "pepe",
  SHIB: "shiba-inu",
  MANA: "decentraland",
  ROSE: "oasis-network",
  BNB: "binancecoin",
  XCH: "chia",
  GPU: "gpu-ai",
  S: "sonic-3",
};

/** Yahoo Finance tickers for stocks/ETFs */
export const YAHOO_TICKERS: Record<string, string> = {
  "MSFT": "MSFT",
  "NVDA": "NVDA",
  "SAN": "SAN.MC",
  "MSCI World": "IWDA.AS",
  "EU Infl Bond": "IBCI.AS",
  "Gold ETC": "SGLD.L",
  "MSCI Momentum": "IWMO.L",
};

/** Get all identifiers for a symbol (ISIN, ticker, CoinGecko ID) */
export function getSymbolIdentifiers(symbol: string): { isin?: string; yahooTicker?: string; geckoId?: string } {
  const isins = SYMBOL_ISINS[symbol];
  return {
    isin: isins?.[0],
    yahooTicker: YAHOO_TICKERS[symbol],
    geckoId: COINGECKO_IDS[symbol],
  };
}

/** Friendly names for symbols */
export const SYMBOL_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  USDC: "USD Coin",
  USDT: "Tether",
  PEPE: "Pepe",
  SHIB: "Shiba Inu",
  MANA: "Decentraland",
  ROSE: "Oasis Network",
  BNB: "BNB",
  XCH: "Chia",
  GPU: "GPU AI",
  S: "Sonic",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  SAN: "Banco Santander",
  "MSCI World": "iShares Core MSCI World UCITS ETF",
  "EU Infl Bond": "iShares € Inflation Linked Govt Bond ETF",
  "Gold ETC": "Invesco Physical Gold ETC",
  "MSCI Momentum": "iShares Edge MSCI World Momentum Factor ETF",
  EUR: "Euro (Cash)",
};

/**
 * Check if a bank transaction description matches a given symbol.
 * Matches by symbol name or any of its ISINs.
 */
export function transactionMatchesSymbol(description: string, symbol: string): boolean {
  const desc = description.toUpperCase();
  // Direct symbol match (for crypto like BTC, ETH)
  if (symbol === "BTC" && desc.includes("BITCOIN")) return true;
  // ISIN match
  const isins = SYMBOL_ISINS[symbol] || [];
  for (const isin of isins) {
    if (desc.includes(isin)) return true;
  }
  // Symbol in description (e.g. "Buy trade US67066G1040 NVIDIA" for NVDA)
  if (desc.includes(symbol.toUpperCase())) return true;
  return false;
}
