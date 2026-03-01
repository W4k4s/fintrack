export interface ExchangeBalance {
  symbol: string;
  free: number;
  used: number;
  total: number;
}

export interface ExchangeTrade {
  id: string;
  symbol: string;        // e.g. "BTC"
  pair: string;          // e.g. "BTC/USDT"
  side: "buy" | "sell";
  amount: number;        // quantity
  price: number;         // price per unit in quote currency
  cost: number;          // total cost (amount * price)
  fee: number;
  feeCurrency: string;
  timestamp: number;     // unix ms
  date: string;          // ISO string
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
  /** Fetch trade history for all symbols */
  fetchTrades?(since?: number): Promise<ExchangeTrade[]>;
}
