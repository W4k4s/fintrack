import ccxt, { Exchange } from "ccxt";
import { ExchangeAdapter, ExchangeBalance } from "./adapter";

// Map wrapped/earn/staking tokens to their base symbol
function resolveBaseSymbol(symbol: string): string {
  // Binance Earn: LDBTC → BTC, LDUSDC → USDC, LDPEPE → PEPE, etc.
  if (symbol.startsWith("LD")) return symbol.slice(2);
  // Binance staking: BETH → ETH, BETH → ETH
  if (symbol === "BETH") return "ETH";
  // Wrapped tokens
  if (symbol === "WBTC") return "BTC";
  if (symbol === "WETH") return "ETH";
  // Stablecoins map to 1 USD
  if (["USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"].includes(symbol)) return symbol;
  return symbol;
}

// Stablecoins always worth ~$1
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"]);

export class CcxtAdapter implements ExchangeAdapter {
  private exchange: Exchange;

  constructor(exchangeId: string, apiKey: string, apiSecret: string, passphrase?: string) {
    const ExchangeClass = (ccxt as Record<string, any>)[exchangeId];
    if (!ExchangeClass) {
      throw new Error(`Exchange "${exchangeId}" not supported by CCXT`);
    }
    const config: Record<string, any> = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
    };
    if (passphrase) {
      config.password = passphrase;
    }
    this.exchange = new ExchangeClass(config);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.exchange.fetchBalance();
      return true;
    } catch {
      return false;
    }
  }

  async fetchBalances(): Promise<ExchangeBalance[]> {
    const balance = await this.exchange.fetchBalance();
    const results: ExchangeBalance[] = [];
    for (const [symbol, data] of Object.entries(balance.total || {})) {
      const total = data as number;
      if (total > 0) {
        const free = ((balance.free as any)?.[symbol] as number) || 0;
        const used = ((balance.used as any)?.[symbol] as number) || 0;
        // Resolve to base symbol (LDBTC → BTC, etc.)
        const baseSymbol = resolveBaseSymbol(symbol);
        results.push({ symbol: baseSymbol, free, used, total });
      }
    }

    // Merge duplicates (e.g. BTC spot + LDBTC earn → single BTC entry)
    const merged = new Map<string, ExchangeBalance>();
    for (const item of results) {
      const existing = merged.get(item.symbol);
      if (existing) {
        existing.total += item.total;
        existing.free += item.free;
        existing.used += item.used;
      } else {
        merged.set(item.symbol, { ...item });
      }
    }

    return Array.from(merged.values());
  }

  async fetchPrice(symbol: string): Promise<number | null> {
    if (STABLECOINS.has(symbol)) return 1;
    try {
      const ticker = await this.exchange.fetchTicker(`${symbol}/USDT`);
      return ticker.last || null;
    } catch {
      try {
        const ticker = await this.exchange.fetchTicker(`${symbol}/USD`);
        return ticker.last || null;
      } catch {
        return null;
      }
    }
  }

  async fetchPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};

    // Set stablecoins immediately
    for (const s of symbols) {
      if (STABLECOINS.has(s)) prices[s] = 1;
    }

    const nonStable = symbols.filter(s => !STABLECOINS.has(s));
    if (nonStable.length === 0) return prices;

    // Try batch first
    try {
      const pairs = nonStable.map(s => `${s}/USDT`);
      const tickers = await this.exchange.fetchTickers(pairs);
      for (const [pair, ticker] of Object.entries(tickers)) {
        const symbol = pair.split("/")[0];
        if (ticker.last) prices[symbol] = ticker.last;
      }
    } catch {
      // Fallback to individual
      for (const symbol of nonStable) {
        const price = await this.fetchPrice(symbol);
        if (price) prices[symbol] = price;
      }
    }
    return prices;
  }
}
