"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { IntelBell } from "./intel-bell";
import { ThemeToggle } from "./theme-toggle";
import { PrivacyToggle } from "./privacy-toggle";
import { useCommandPalette } from "./command-palette-context";

function currentTitle(pathname: string): string {
  const exact = NAV_ITEMS.find((n) => n.href === pathname);
  if (exact) return exact.label;
  const prefix = NAV_ITEMS.filter((n) => n.href !== "/" && pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return prefix?.label ?? "FinTrack";
}

export function TopBar() {
  const pathname = usePathname();
  const title = currentTitle(pathname);
  const { open: openPalette } = useCommandPalette();

  const SearchButton = (
    <button
      onClick={openPalette}
      className={cn(
        "flex items-center gap-2 h-9 px-3 rounded-lg min-w-0",
        "bg-elevated hover:bg-[var(--hover-bg)] border border-border",
        "text-muted-foreground hover:text-foreground transition-colors",
      )}
      aria-label="Search (⌘K)"
    >
      <Search className="w-4 h-4 shrink-0" />
      <span className="text-[13px] truncate">Search assets, signals, pages…</span>
      <span className="ml-2 hidden md:flex items-center gap-0.5 text-[10px] text-muted-foreground/80 font-mono">
        <kbd className="px-1.5 py-0.5 rounded border border-border bg-card">⌘</kbd>
        <kbd className="px-1.5 py-0.5 rounded border border-border bg-card">K</kbd>
      </span>
    </button>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-30",
        "bg-background/80 backdrop-blur-lg border-b border-border",
      )}
    >
      {/* Desktop: title left · search absolutely centered · actions right */}
      <div className="hidden md:flex relative items-center px-6 h-14">
        <div className="flex items-center min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold tracking-tight truncate">{title}</h1>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md px-4 pointer-events-none">
          <div className="pointer-events-auto">
            {SearchButton}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <IntelBell />
          <PrivacyToggle />
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile: brand left · compact search center · actions right */}
      <div className="md:hidden flex items-center gap-2 px-3 h-14">
        <Link href="/" aria-label="FinTrack · dashboard" className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-accent" aria-hidden="true" />
          </div>
        </Link>
        <button
          onClick={openPalette}
          aria-label="Search"
          className="flex-1 min-w-0 flex items-center gap-2 h-9 px-3 rounded-lg bg-elevated hover:bg-[var(--hover-bg)] border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="text-[13px] truncate">Search…</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <IntelBell />
          <PrivacyToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
