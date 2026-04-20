"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type CommandPaletteCtx = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const Ctx = createContext<CommandPaletteCtx | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((v) => !v);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCommandPalette(): CommandPaletteCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return v;
}
