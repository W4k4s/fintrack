import { ExchangeAdapter, ExchangeBalance } from "./adapter";

/** Adapter for manually-tracked accounts (banks, Trade Republic, hardware wallets) */
export class ManualAdapter implements ExchangeAdapter {
  async testConnection(): Promise<boolean> {
    return true; // Manual accounts always "connected"
  }

  async fetchBalances(): Promise<ExchangeBalance[]> {
    return []; // Balances managed manually in DB
  }

  async fetchPrice(): Promise<number | null> {
    return null;
  }

  async fetchPrices(): Promise<Record<string, number>> {
    return {};
  }
}
