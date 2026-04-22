"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";
import { useIntelUnread } from "@/hooks/use-intel-unread";

export function BottomTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { count: intelUnread } = useIntelUnread();

  const primary = NAV_ITEMS.filter((i) => i.primary);
  const secondary = NAV_ITEMS.filter((i) => !i.primary);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
      >
        <ul className="flex items-stretch">
          {primary.map((item) => {
            const { href, label, icon: Icon } = item;
            const active = isActive(pathname, href);
            const badge = item.badgeKey === "intel" ? intelUnread : 0;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                    active ? "text-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="relative">
                    <Icon className="w-[22px] h-[22px]" />
                    {badge > 0 && (
                      <span aria-hidden="true" className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-[9px] font-semibold leading-[16px] text-center text-danger-foreground">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </div>
                  <span className="leading-none">{label}</span>
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-accent rounded-full" />
                  )}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setMoreOpen(true)}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 w-full text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <MoreHorizontal className="w-[22px] h-[22px]" />
              <span className="leading-none">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl p-4 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-overline">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-md hover:bg-[var(--hover-bg)]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {secondary.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                        active
                          ? "bg-accent/15 text-accent"
                          : "text-foreground hover:bg-[var(--hover-bg)]",
                      )}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
