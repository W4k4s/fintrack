"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePrivacy } from "@/components/privacy-provider";

interface CurrencyContextType {
  currency: string;
  symbol: string;
  rate: number;
  setCurrency: (c: string) => void;
  /** Convert a USD value to the user's display currency. */
  convert: (usd: number) => number;
  /** Format a USD value in the user's display currency. */
  format: (usd: number) => string;
  /** Convert a value from an arbitrary source currency to the user's display currency. */
  convertFrom: (amount: number, sourceCurrency: string) => number;
  /** Format a value from an arbitrary source currency in the user's display currency. */
  formatFrom: (amount: number, sourceCurrency: string) => string;
}

const currencies: Record<string, { symbol: string; label: string }> = {
  USD: { symbol: "$", label: "US Dollar" },
  EUR: { symbol: "€", label: "Euro" },
  GBP: { symbol: "£", label: "British Pound" },
  JPY: { symbol: "¥", label: "Japanese Yen" },
  CHF: { symbol: "Fr", label: "Swiss Franc" },
  CAD: { symbol: "C$", label: "Canadian Dollar" },
  AUD: { symbol: "A$", label: "Australian Dollar" },
  BRL: { symbol: "R$", label: "Brazilian Real" },
  MXN: { symbol: "Mex$", label: "Mexican Peso" },
};

// USD-pegged stablecoins — treated as 1:1 with USD for display conversion.
const USD_STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USD"]);

export { currencies };

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "USD",
  symbol: "$",
  rate: 1,
  setCurrency: () => {},
  convert: (v) => v,
  format: (v) => `$${v.toFixed(2)}`,
  convertFrom: (v) => v,
  formatFrom: (v) => `$${v.toFixed(2)}`,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("USD");
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const { mask } = usePrivacy();

  useEffect(() => {
    const saved = localStorage.getItem("fintrack-currency") || "USD";
    setCurrencyState(saved);
    fetch("/api/currency").then(r => r.json()).then(setRates).catch(() => {});
  }, []);

  const setCurrency = (c: string) => {
    setCurrencyState(c);
    localStorage.setItem("fintrack-currency", c);
  };

  const rate = rates[currency] || 1;
  const sym = currencies[currency]?.symbol || currency;

  const convert = (usd: number) => usd * rate;

  const format = (usd: number) => {
    const val = usd * rate;
    return mask(new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val));
  };

  // Normalize any source currency to USD, then to the display currency.
  // Rates are USD-based (rates[X] = how many X per 1 USD).
  const toUsd = (amount: number, source: string): number => {
    const src = (source || "USD").toUpperCase();
    if (USD_STABLECOINS.has(src)) return amount;
    const srcRate = rates[src];
    if (!srcRate) return amount; // unknown currency — fall through as-is
    return amount / srcRate;
  };

  const convertFrom = (amount: number, sourceCurrency: string) =>
    toUsd(amount, sourceCurrency) * rate;

  const formatFrom = (amount: number, sourceCurrency: string) =>
    mask(new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(convertFrom(amount, sourceCurrency)));

  return (
    <CurrencyContext.Provider value={{ currency, symbol: sym, rate, setCurrency, convert, format, convertFrom, formatFrom }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
