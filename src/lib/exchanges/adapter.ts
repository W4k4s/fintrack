export interface ExchangeBalance {
  symbol: string;
  free: number;
  used: number;
  total: number;
}

export interface ExchangeAdapter {
  /** Test if the connection/credentials work */
  testConnection(): Promise<boolean>;
  /** Fetch all balances from the exchange */
  fetchBalances(): Promise<ExchangeBalance[]>;
  /** Get current price for a symbol pair (e.g. BTC/USDT) */
  fetchPrice(symbol: string): Promise<number | null>;
  /** Get prices for multiple symbols at once */
  fetchPrices(symbols: string[]): Promise<Record<string, number>>;
}
