import ccxt, { Exchange } from "ccxt";
import { ExchangeAdapter, ExchangeBalance } from "./adapter";

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
        results.push({ symbol, free, used, total });
      }
    }
    return results;
  }

  async fetchPrice(symbol: string): Promise<number | null> {
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
    // Try batch first
    try {
      const pairs = symbols.map(s => `${s}/USDT`);
      const tickers = await this.exchange.fetchTickers(pairs);
      for (const [pair, ticker] of Object.entries(tickers)) {
        const symbol = pair.split("/")[0];
        if (ticker.last) prices[symbol] = ticker.last;
      }
    } catch {
      // Fallback to individual
      for (const symbol of symbols) {
        const price = await this.fetchPrice(symbol);
        if (price) prices[symbol] = price;
      }
    }
    return prices;
  }
}
