"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";
import { useIntelUnread } from "@/hooks/use-intel-unread";

const STORAGE_KEY = "fintrack-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { count: intelUnread } = useIntelUnread();

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col bg-card border-r border-border sticky top-0 h-screen",
        "transition-[width] duration-200 ease-[var(--ease-standard)]",
        collapsed ? "w-[64px]" : "w-[240px]",
      )}
      aria-label="Primary"
    >
      {/* Brand + collapse toggle */}
      <div className={cn("flex items-center px-3 py-4 gap-2", collapsed && "justify-center px-0")}>
        <Link
          href="/"
          className={cn("flex items-center gap-2.5 min-w-0", collapsed && "justify-center w-full")}
          aria-label="FinTrack home"
        >
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <TrendingUp className="w-[18px] h-[18px] text-accent" />
          </div>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight truncate">FinTrack</span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={toggle}
            className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)] transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggle}
          className="mx-auto mb-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="Expand sidebar"
          title="Expand"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}

      {/* Nav */}
      <nav className={cn("flex flex-col gap-0.5 flex-1", collapsed ? "px-2" : "px-3")}>
        {NAV_ITEMS.map((item) => {
          const { href, label, icon: Icon } = item;
          const active = isActive(pathname, href);
          const badge = item.badgeKey === "intel" ? intelUnread : 0;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)]",
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {badge > 0 && !collapsed && (
                <span className="ml-auto text-[10px] font-semibold bg-accent text-accent-foreground rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {badge > 0 && collapsed && (
                <span className="absolute top-0.5 right-0.5 w-[8px] h-[8px] rounded-full bg-danger ring-2 ring-card" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {mounted && !collapsed && (
        <div className="border-t border-border px-4 py-3">
          <div className="text-[11px] text-muted-foreground tracking-wide">FinTrack · v0.1.0</div>
        </div>
      )}
    </aside>
  );
}
