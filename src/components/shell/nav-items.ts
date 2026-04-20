import {
  LayoutDashboard,
  Wallet,
  Landmark,
  CalendarClock,
  Receipt,
  Settings,
  Target,
  Radar,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "intel";
  primary?: boolean; // shown in mobile bottom tabs
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard, primary: true },
  { href: "/strategy",     label: "Strategy",     icon: Target,          primary: true },
  { href: "/intel",        label: "Intel",        icon: Radar,           badgeKey: "intel", primary: true },
  { href: "/assets",       label: "Assets",       icon: Wallet,          primary: true },
  { href: "/exchanges",    label: "Accounts",     icon: Landmark },
  { href: "/plans",        label: "DCA Plans",    icon: CalendarClock },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/expenses",     label: "Expenses",     icon: CreditCard },
  { href: "/settings",     label: "Settings",     icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
