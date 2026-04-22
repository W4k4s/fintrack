"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export function Collapsible({
  title, defaultOpen = false, children, icon, badge,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
  icon?: React.ReactNode; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-elevated transition-colors">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {icon} {title}
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 bg-elevated text-muted-foreground rounded-full font-normal">
              {badge}
            </span>
          )}
        </h3>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
