"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface CurrencyContextType {
  currency: string;
  symbol: string;
  rate: number;
  setCurrency: (c: string) => void;
  convert: (usd: number) => number;
  format: (usd: number) => string;
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

export { currencies };

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "USD",
  symbol: "$",
  rate: 1,
  setCurrency: () => {},
  convert: (v) => v,
  format: (v) => `$${v.toFixed(2)}`,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("USD");
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });

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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <CurrencyContext.Provider value={{ currency, symbol: sym, rate, setCurrency, convert, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
