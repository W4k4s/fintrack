"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const STORAGE_KEY = "fintrack-privacy";

interface PrivacyContextType {
  hidden: boolean;
  toggle: () => void;
  setHidden: (v: boolean) => void;
  /**
   * Replace every digit (and thousand/decimal separators + signs) in the
   * passed string with a bullet when privacy mode is on. Non-numeric
   * characters (currency symbol, spaces, unit suffixes) are preserved so
   * the reader keeps a sense of scale without revealing the actual value.
   *
   * Use only for money amounts. Percentages, multipliers, counts and
   * other non-monetary indicators should stay untouched.
   */
  mask: (label: string) => string;
}

const PrivacyContext = createContext<PrivacyContextType>({
  hidden: false,
  toggle: () => {},
  setHidden: () => {},
  mask: (s) => s,
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) === "1";
    setHiddenState(saved);
  }, []);

  const setHidden = (v: boolean) => {
    setHiddenState(v);
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  };

  const toggle = () => setHidden(!hidden);

  const mask = (label: string) => {
    if (!hidden) return label;
    return label.replace(/\d/g, "•");
  };

  return (
    <PrivacyContext.Provider value={{ hidden, toggle, setHidden, mask }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
