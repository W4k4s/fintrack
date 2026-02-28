export interface ExchangeInfo {
  id: string;
  name: string;
  logo: string;
  type: "auto" | "manual";
  requiresPassphrase: boolean;
  website: string;
  tags: string[];
}

export const exchangeRegistry: ExchangeInfo[] = [
  // Major CEX
  { id: "binance", name: "Binance", logo: "/logos/binance.ico", type: "auto", requiresPassphrase: false, website: "https://binance.com", tags: ["cex", "major"] },
  { id: "kucoin", name: "KuCoin", logo: "/logos/kucoin.png", type: "auto", requiresPassphrase: true, website: "https://kucoin.com", tags: ["cex", "major"] },
  { id: "mexc", name: "MEXC", logo: "/logos/mexc.png", type: "auto", requiresPassphrase: false, website: "https://mexc.com", tags: ["cex", "major"] },
  { id: "coinbase", name: "Coinbase", logo: "/logos/coinbase.ico", type: "auto", requiresPassphrase: false, website: "https://coinbase.com", tags: ["cex", "major"] },
  { id: "kraken", name: "Kraken", logo: "/logos/kraken.png", type: "auto", requiresPassphrase: false, website: "https://kraken.com", tags: ["cex", "major"] },
  { id: "bybit", name: "Bybit", logo: "/logos/bybit.png", type: "auto", requiresPassphrase: false, website: "https://bybit.com", tags: ["cex", "major"] },
  { id: "okx", name: "OKX", logo: "/logos/okx.png", type: "auto", requiresPassphrase: true, website: "https://okx.com", tags: ["cex", "major"] },
  { id: "gateio", name: "Gate.io", logo: "/logos/gate.png", type: "auto", requiresPassphrase: false, website: "https://gate.io", tags: ["cex", "major"] },
  { id: "bitget", name: "Bitget", logo: "/logos/bitget.png", type: "auto", requiresPassphrase: true, website: "https://bitget.com", tags: ["cex", "major"] },
  { id: "cryptocom", name: "Crypto.com", logo: "/logos/crypto.png", type: "auto", requiresPassphrase: false, website: "https://crypto.com", tags: ["cex", "major"] },
  { id: "htx", name: "HTX (Huobi)", logo: "/logos/htx.png", type: "auto", requiresPassphrase: false, website: "https://htx.com", tags: ["cex", "major"] },
  { id: "bitfinex", name: "Bitfinex", logo: "/logos/bitfinex.png", type: "auto", requiresPassphrase: false, website: "https://bitfinex.com", tags: ["cex"] },
  { id: "gemini", name: "Gemini", logo: "/logos/gemini.png", type: "auto", requiresPassphrase: false, website: "https://gemini.com", tags: ["cex"] },
  { id: "bitstamp", name: "Bitstamp", logo: "/logos/bitstamp.png", type: "auto", requiresPassphrase: false, website: "https://bitstamp.net", tags: ["cex"] },
  { id: "poloniex", name: "Poloniex", logo: "/logos/poloniex.png", type: "auto", requiresPassphrase: false, website: "https://poloniex.com", tags: ["cex"] },
  { id: "bitmart", name: "BitMart", logo: "/logos/bitmart.png", type: "auto", requiresPassphrase: false, website: "https://bitmart.com", tags: ["cex"] },
  { id: "phemex", name: "Phemex", logo: "/logos/phemex.png", type: "auto", requiresPassphrase: false, website: "https://phemex.com", tags: ["cex"] },
  { id: "bingx", name: "BingX", logo: "/logos/bingx.png", type: "auto", requiresPassphrase: false, website: "https://bingx.com", tags: ["cex"] },
  { id: "lbank", name: "LBank", logo: "/logos/lbank.png", type: "auto", requiresPassphrase: false, website: "https://lbank.com", tags: ["cex"] },
  { id: "whitebit", name: "WhiteBIT", logo: "/logos/whitebit.png", type: "auto", requiresPassphrase: false, website: "https://whitebit.com", tags: ["cex"] },
  // DEX
  { id: "uniswap", name: "Uniswap", logo: "/logos/uniswap.png", type: "manual", requiresPassphrase: false, website: "https://uniswap.org", tags: ["dex"] },
  // Hardware / Wallets
  { id: "ledger", name: "Ledger", logo: "/logos/ledger.png", type: "manual", requiresPassphrase: false, website: "https://ledger.com", tags: ["hardware", "wallet"] },
  { id: "trezor", name: "Trezor", logo: "/logos/trezor.png", type: "manual", requiresPassphrase: false, website: "https://trezor.io", tags: ["hardware", "wallet"] },
  { id: "metamask", name: "MetaMask", logo: "/logos/metamask.png", type: "manual", requiresPassphrase: false, website: "https://metamask.io", tags: ["wallet"] },
  // Brokers
  { id: "trade-republic", name: "Trade Republic", logo: "/logos/traderepublic.png", type: "manual", requiresPassphrase: false, website: "https://traderepublic.com", tags: ["broker", "stocks", "etf"] },
  { id: "degiro", name: "DEGIRO", logo: "/logos/degiro.png", type: "manual", requiresPassphrase: false, website: "https://degiro.com", tags: ["broker", "stocks", "etf"] },
  { id: "interactive-brokers", name: "Interactive Brokers", logo: "/logos/interactivebrokers.png", type: "manual", requiresPassphrase: false, website: "https://interactivebrokers.com", tags: ["broker", "stocks", "etf"] },
  // Banks
  { id: "revolut", name: "Revolut", logo: "/logos/revolut.png", type: "manual", requiresPassphrase: false, website: "https://revolut.com", tags: ["bank", "crypto", "stocks"] },
  { id: "n26", name: "N26", logo: "/logos/n26.png", type: "manual", requiresPassphrase: false, website: "https://n26.com", tags: ["bank"] },
  { id: "wise", name: "Wise", logo: "/logos/wise.png", type: "manual", requiresPassphrase: false, website: "https://wise.com", tags: ["bank"] },
  { id: "bank-manual", name: "Bank Account (Manual)", logo: "", type: "manual", requiresPassphrase: false, website: "", tags: ["bank", "manual"] },
  { id: "other-manual", name: "Other (Manual)", logo: "", type: "manual", requiresPassphrase: false, website: "", tags: ["manual"] },
];

export function getExchangeInfo(id: string): ExchangeInfo | undefined {
  return exchangeRegistry.find(e => e.id === id);
}

export function getExchangesByTag(tag: string): ExchangeInfo[] {
  return exchangeRegistry.filter(e => e.tags.includes(tag));
}
