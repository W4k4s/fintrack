"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Wallet, Landmark,
  CalendarClock, Receipt, Settings, TrendingUp, CreditCard,
  Menu, X, Target, Radar,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/exchanges", label: "Accounts", icon: Landmark },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/strategy", label: "Strategy", icon: Target },
  { href: "/intel", label: "Intel", icon: Radar, badgeKey: "intel" },
  { href: "/plans", label: "DCA Plans", icon: CalendarClock },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ pathname, onClick }: { pathname: string; onClick?: () => void }) {
  const [intelUnread, setIntelUnread] = useState<number>(0);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/intel?status=unread&limit=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setIntelUnread(Number(data.unreadCount || 0));
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const { href, label, icon: Icon } = item;
        const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
        const badge = "badgeKey" in item && item.badgeKey === "intel" && intelUnread > 0 ? intelUnread : 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              active
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground hover:bg-[var(--hover-bg)]"
            )}
          >
            <Icon className="w-[18px] h-[18px]" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="ml-auto text-[10px] font-semibold bg-accent text-accent-foreground rounded-full px-2 py-0.5 min-w-[20px] text-center">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-accent" />
          </div>
          <span className="text-base font-bold tracking-tight">FinTrack</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="fixed top-[53px] left-0 right-0 bg-card border-b border-border p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <NavLinks pathname={pathname} onClick={() => setOpen(false)} />
          </div>
        </div>
      )}



      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-card border-r border-border p-4 sticky top-0 h-screen">
        <Link href="/" className="flex items-center gap-2.5 px-3 mb-8 mt-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-accent" />
          </div>
          <span className="text-lg font-bold tracking-tight">FinTrack</span>
        </Link>
        <NavLinks pathname={pathname} />
        <div className="mt-auto pt-4 border-t border-border">
          <div className="px-3 py-2 text-xs text-muted-foreground">FinTrack v0.1.0</div>
        </div>
      </aside>
    </>
  );
}
