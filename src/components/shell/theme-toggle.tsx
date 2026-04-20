"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fintrack-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = (localStorage.getItem(STORAGE_KEY) as "dark" | "light") || "dark";
    setTheme(t);
  }, []);

  const toggle = () => {
    const next: "dark" | "light" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.className = next === "light" ? "light" : "dark";
    } catch {}
  };

  if (!mounted) {
    return <div className={cn("w-9 h-9", className)} aria-hidden />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)] transition-colors",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
