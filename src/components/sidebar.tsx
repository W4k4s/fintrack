"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  CalendarClock,
  Receipt,
  Settings,
  TrendingUp,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/exchanges", label: "Exchanges", icon: ArrowLeftRight },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/plans", label: "DCA Plans", icon: CalendarClock },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-zinc-800 bg-zinc-900/50 p-4">
      <Link href="/" className="flex items-center gap-2 px-2 mb-8">
        <TrendingUp className="w-6 h-6 text-emerald-500" />
        <span className="text-xl font-bold">FinTrack</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === href
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
