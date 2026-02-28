"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ArrowLeftRight, Wallet,
  CalendarClock, Receipt, Settings, TrendingUp, Upload, CreditCard,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/exchanges", label: "Exchanges", icon: ArrowLeftRight },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/plans", label: "DCA Plans", icon: CalendarClock },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 flex-col bg-card border-r border-border p-4 sticky top-0 h-screen">
      <Link href="/" className="flex items-center gap-2.5 px-3 mb-8 mt-2">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-accent" />
        </div>
        <span className="text-lg font-bold tracking-tight">FinTrack</span>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-foreground hover:bg-[var(--hover-bg)]"
              )}
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-border">
        <div className="px-3 py-2 text-xs text-muted-foreground">FinTrack v0.1.0</div>
      </div>
    </aside>
  );
}
