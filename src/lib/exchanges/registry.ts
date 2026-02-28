export interface ExchangeInfo {
  id: string;
  name: string;
  logo: string;
  type: "auto" | "manual";
  requiresPassphrase: boolean;
  website: string;
  tags: string[];
}

// Using reliable CDN sources for logos
const ccxtLogo = (id: string) => `https://user-images.githubusercontent.com/1294454/${exchangeLogos[id] || ""}`;
const cryptoLogo = (symbol: string) => `https://assets.coingecko.com/coins/images/${coinIds[symbol] || "1"}/small/${symbol.toLowerCase()}.png`;

// Exchange logo mappings (GitHub user-images from CCXT readme)
const exchangeLogos: Record<string, string> = {};

// Simpler: use direct known URLs
export const exchangeRegistry: ExchangeInfo[] = [
  // Major CEX
  { id: "binance", name: "Binance", logo: "https://cdn.worldvectorlogo.com/logos/binance.svg", type: "auto", requiresPassphrase: false, website: "https://binance.com", tags: ["cex", "major"] },
  { id: "kucoin", name: "KuCoin", logo: "https://assets.staticimg.com/cms/media/1lB3PkckFDyfxz6VudCEACGX8RA.png", type: "auto", requiresPassphrase: true, website: "https://kucoin.com", tags: ["cex", "major"] },
  { id: "mexc", name: "MEXC", logo: "https://www.mexc.com/apple-touch-icon.png", type: "auto", requiresPassphrase: false, website: "https://mexc.com", tags: ["cex", "major"] },
  { id: "coinbase", name: "Coinbase", logo: "https://images.ctfassets.net/c5bd0wqjc7v0/4CxF1YaKHNIY0Z4RKJ4VOf/e83dcbbfa1b7c8f7e5ba754a8b539724/coinbase-mark-blue.svg", type: "auto", requiresPassphrase: false, website: "https://coinbase.com", tags: ["cex", "major"] },
  { id: "kraken", name: "Kraken", logo: "https://assets-cms.kraken.com/images/51n36hr1/facade/aa1f76783d3090a160a4bd42200f67c82f570e15-20x20.svg", type: "auto", requiresPassphrase: false, website: "https://kraken.com", tags: ["cex", "major"] },
  { id: "bybit", name: "Bybit", logo: "https://cdn.bybit.com/obj/prod/brand/bybit-logo-icon.svg", type: "auto", requiresPassphrase: false, website: "https://bybit.com", tags: ["cex", "major"] },
  { id: "okx", name: "OKX", logo: "https://static.okx.com/cdn/assets/imgs/248/4BD0F15B30E9D69D.png", type: "auto", requiresPassphrase: true, website: "https://okx.com", tags: ["cex", "major"] },
  { id: "gateio", name: "Gate.io", logo: "https://www.gate.io/images/logo/gate_logo.svg", type: "auto", requiresPassphrase: false, website: "https://gate.io", tags: ["cex", "major"] },
  { id: "bitget", name: "Bitget", logo: "https://img.bitgetimg.com/image/third/1700474681156.png", type: "auto", requiresPassphrase: true, website: "https://bitget.com", tags: ["cex", "major"] },
  { id: "cryptocom", name: "Crypto.com", logo: "https://crypto.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://crypto.com", tags: ["cex", "major"] },
  { id: "htx", name: "HTX (Huobi)", logo: "https://www.htx.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://htx.com", tags: ["cex", "major"] },
  { id: "bitfinex", name: "Bitfinex", logo: "https://www.bitfinex.com/assets/bfx-stacked.svg", type: "auto", requiresPassphrase: false, website: "https://bitfinex.com", tags: ["cex"] },
  { id: "gemini", name: "Gemini", logo: "https://www.gemini.com/static/images/loader/gemini-loader.png", type: "auto", requiresPassphrase: false, website: "https://gemini.com", tags: ["cex"] },
  { id: "bitstamp", name: "Bitstamp", logo: "https://www.bitstamp.net/static/revamp/images/logo/BitstampLogo.svg", type: "auto", requiresPassphrase: false, website: "https://bitstamp.net", tags: ["cex"] },
  { id: "poloniex", name: "Poloniex", logo: "https://poloniex.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://poloniex.com", tags: ["cex"] },
  { id: "bitmart", name: "BitMart", logo: "https://www.bitmart.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://bitmart.com", tags: ["cex"] },
  { id: "phemex", name: "Phemex", logo: "https://phemex.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://phemex.com", tags: ["cex"] },
  { id: "bingx", name: "BingX", logo: "https://bingx.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://bingx.com", tags: ["cex"] },
  { id: "lbank", name: "LBank", logo: "https://www.lbank.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://lbank.com", tags: ["cex"] },
  { id: "whitebit", name: "WhiteBIT", logo: "https://whitebit.com/favicon.ico", type: "auto", requiresPassphrase: false, website: "https://whitebit.com", tags: ["cex"] },
  // DEX
  { id: "uniswap", name: "Uniswap", logo: "https://app.uniswap.org/favicon.png", type: "manual", requiresPassphrase: false, website: "https://uniswap.org", tags: ["dex"] },
  // Manual / Hardware / Traditional
  { id: "ledger", name: "Ledger", logo: "https://www.ledger.com/wp-content/themes/starter-flavor/dist/images/favicons/favicon-32x32.png", type: "manual", requiresPassphrase: false, website: "https://ledger.com", tags: ["hardware", "wallet"] },
  { id: "trezor", name: "Trezor", logo: "https://trezor.io/favicon/favicon-32x32.png", type: "manual", requiresPassphrase: false, website: "https://trezor.io", tags: ["hardware", "wallet"] },
  { id: "metamask", name: "MetaMask", logo: "https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg", type: "manual", requiresPassphrase: false, website: "https://metamask.io", tags: ["wallet"] },
  { id: "trade-republic", name: "Trade Republic", logo: "https://traderepublic.com/favicon.ico", type: "manual", requiresPassphrase: false, website: "https://traderepublic.com", tags: ["broker", "stocks", "etf"] },
  { id: "degiro", name: "DEGIRO", logo: "https://www.degiro.com/favicon.ico", type: "manual", requiresPassphrase: false, website: "https://degiro.com", tags: ["broker", "stocks", "etf"] },
  { id: "interactive-brokers", name: "Interactive Brokers", logo: "https://www.interactivebrokers.com/favicon.ico", type: "manual", requiresPassphrase: false, website: "https://interactivebrokers.com", tags: ["broker", "stocks", "etf"] },
  { id: "revolut", name: "Revolut", logo: "https://www.revolut.com/favicon/favicon-32x32.png", type: "manual", requiresPassphrase: false, website: "https://revolut.com", tags: ["bank", "crypto", "stocks"] },
  { id: "n26", name: "N26", logo: "https://n26.com/favicon.ico", type: "manual", requiresPassphrase: false, website: "https://n26.com", tags: ["bank"] },
  { id: "wise", name: "Wise", logo: "https://wise.com/public-resources/assets/icons/favicon-32x32.png", type: "manual", requiresPassphrase: false, website: "https://wise.com", tags: ["bank"] },
  { id: "bank-manual", name: "Bank Account (Manual)", logo: "", type: "manual", requiresPassphrase: false, website: "", tags: ["bank", "manual"] },
  { id: "other-manual", name: "Other (Manual)", logo: "", type: "manual", requiresPassphrase: false, website: "", tags: ["manual"] },
];

// Coin ID mapping for CoinGecko logos (used for asset icons)
const coinIds: Record<string, string> = {};

export function getExchangeInfo(id: string): ExchangeInfo | undefined {
  return exchangeRegistry.find(e => e.id === id);
}

export function getExchangesByTag(tag: string): ExchangeInfo[] {
  return exchangeRegistry.filter(e => e.tags.includes(tag));
}
