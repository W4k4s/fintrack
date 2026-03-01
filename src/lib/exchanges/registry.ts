export type AccountCategory = "exchange" | "broker" | "bank" | "wallet";

export interface ExchangeInfo {
  id: string;
  name: string;
  logo: string;
  category: AccountCategory;
  type: "auto" | "manual";
  requiresPassphrase: boolean;
  website: string;
  tags: string[];
  importFormat?: "csv" | "xls" | "pdf";  // for manual imports
}

export const categoryLabels: Record<AccountCategory, { label: string; plural: string; icon: string }> = {
  exchange: { label: "Exchange", plural: "Exchanges", icon: "ArrowLeftRight" },
  broker: { label: "Broker", plural: "Brokers", icon: "TrendingUp" },
  bank: { label: "Bank", plural: "Banks", icon: "Landmark" },
  wallet: { label: "Wallet", plural: "Wallets", icon: "Wallet" },
};

export const exchangeRegistry: ExchangeInfo[] = [
  // CEX
  { id: "binance", name: "Binance", logo: "/logos/binance.ico", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://binance.com", tags: ["cex", "major"] },
  { id: "kucoin", name: "KuCoin", logo: "/logos/kucoin.png", category: "exchange", type: "auto", requiresPassphrase: true, website: "https://kucoin.com", tags: ["cex", "major"] },
  { id: "mexc", name: "MEXC", logo: "/logos/mexc.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://mexc.com", tags: ["cex", "major"] },
  { id: "coinbase", name: "Coinbase", logo: "/logos/coinbase.ico", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://coinbase.com", tags: ["cex", "major"] },
  { id: "kraken", name: "Kraken", logo: "/logos/kraken.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://kraken.com", tags: ["cex", "major"] },
  { id: "bybit", name: "Bybit", logo: "/logos/bybit.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://bybit.com", tags: ["cex", "major"] },
  { id: "okx", name: "OKX", logo: "/logos/okx.png", category: "exchange", type: "auto", requiresPassphrase: true, website: "https://okx.com", tags: ["cex", "major"] },
  { id: "gateio", name: "Gate.io", logo: "/logos/gate.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://gate.io", tags: ["cex", "major"] },
  { id: "bitget", name: "Bitget", logo: "/logos/bitget.png", category: "exchange", type: "auto", requiresPassphrase: true, website: "https://bitget.com", tags: ["cex", "major"] },
  { id: "cryptocom", name: "Crypto.com", logo: "/logos/crypto.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://crypto.com", tags: ["cex", "major"] },
  { id: "htx", name: "HTX (Huobi)", logo: "/logos/htx.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://htx.com", tags: ["cex", "major"] },
  { id: "bitfinex", name: "Bitfinex", logo: "/logos/bitfinex.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://bitfinex.com", tags: ["cex"] },
  { id: "gemini", name: "Gemini", logo: "/logos/gemini.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://gemini.com", tags: ["cex"] },
  { id: "bitstamp", name: "Bitstamp", logo: "/logos/bitstamp.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://bitstamp.net", tags: ["cex"] },
  { id: "poloniex", name: "Poloniex", logo: "/logos/poloniex.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://poloniex.com", tags: ["cex"] },
  { id: "bitmart", name: "BitMart", logo: "/logos/bitmart.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://bitmart.com", tags: ["cex"] },
  { id: "phemex", name: "Phemex", logo: "/logos/phemex.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://phemex.com", tags: ["cex"] },
  { id: "bingx", name: "BingX", logo: "/logos/bingx.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://bingx.com", tags: ["cex"] },
  { id: "lbank", name: "LBank", logo: "/logos/lbank.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://lbank.com", tags: ["cex"] },
  { id: "whitebit", name: "WhiteBIT", logo: "/logos/whitebit.png", category: "exchange", type: "auto", requiresPassphrase: false, website: "https://whitebit.com", tags: ["cex"] },
  // DEX
  { id: "uniswap", name: "Uniswap", logo: "/logos/uniswap.png", category: "exchange", type: "manual", requiresPassphrase: false, website: "https://uniswap.org", tags: ["dex"] },
  // Wallets
  { id: "ledger", name: "Ledger", logo: "/logos/ledger.png", category: "wallet", type: "manual", requiresPassphrase: false, website: "https://ledger.com", tags: ["hardware"] },
  { id: "trezor", name: "Trezor", logo: "/logos/trezor.png", category: "wallet", type: "manual", requiresPassphrase: false, website: "https://trezor.io", tags: ["hardware"] },
  { id: "metamask", name: "MetaMask", logo: "/logos/metamask.png", category: "wallet", type: "manual", requiresPassphrase: false, website: "https://metamask.io", tags: [] },
  // Brokers
  { id: "trade-republic", name: "Trade Republic", logo: "/logos/traderepublic.png", category: "broker", type: "manual", requiresPassphrase: false, website: "https://traderepublic.com", tags: ["stocks", "etf", "crypto"], importFormat: "pdf" },
  { id: "degiro", name: "DEGIRO", logo: "/logos/degiro.png", category: "broker", type: "manual", requiresPassphrase: false, website: "https://degiro.com", tags: ["stocks", "etf"], importFormat: "csv" },
  { id: "interactive-brokers", name: "Interactive Brokers", logo: "/logos/interactivebrokers.png", category: "broker", type: "manual", requiresPassphrase: false, website: "https://interactivebrokers.com", tags: ["stocks", "etf"], importFormat: "csv" },
  // Banks
  { id: "ing", name: "ING", logo: "/logos/ing.png", category: "bank", type: "manual", requiresPassphrase: false, website: "https://ing.es", tags: ["spain"], importFormat: "xls" },
  { id: "revolut", name: "Revolut", logo: "/logos/revolut.png", category: "bank", type: "manual", requiresPassphrase: false, website: "https://revolut.com", tags: ["crypto", "stocks"], importFormat: "csv" },
  { id: "n26", name: "N26", logo: "/logos/n26.png", category: "bank", type: "manual", requiresPassphrase: false, website: "https://n26.com", tags: [], importFormat: "csv" },
  { id: "wise", name: "Wise", logo: "/logos/wise.png", category: "bank", type: "manual", requiresPassphrase: false, website: "https://wise.com", tags: [], importFormat: "csv" },
  { id: "bank-manual", name: "Other Bank", logo: "", category: "bank", type: "manual", requiresPassphrase: false, website: "", tags: [] },
  { id: "other-manual", name: "Other", logo: "", category: "wallet", type: "manual", requiresPassphrase: false, website: "", tags: [] },
];

export function getExchangeInfo(id: string): ExchangeInfo | undefined {
  return exchangeRegistry.find(e => e.id === id);
}

export function getByCategory(category: AccountCategory): ExchangeInfo[] {
  return exchangeRegistry.filter(e => e.category === category);
}

export function getExchangesByTag(tag: string): ExchangeInfo[] {
  return exchangeRegistry.filter(e => e.tags.includes(tag));
}
