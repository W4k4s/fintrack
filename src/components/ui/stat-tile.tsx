import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const valueClass = cva("font-bold tabular-nums leading-tight", {
  variants: {
    size: {
      sm: "text-xl",
      md: "text-2xl md:text-3xl",
      lg: "text-3xl md:text-4xl",
    },
    tone: {
      default: "text-foreground",
      success: "text-success",
      warn: "text-warn",
      danger: "text-danger",
      info: "text-info",
    },
  },
  defaultVariants: { size: "md", tone: "default" },
});

export interface StatTileProps extends VariantProps<typeof valueClass> {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: { value: number; suffix?: string };
  icon?: React.ReactNode;
  className?: string;
}

export function StatTile({
  label, value, hint, delta, icon, className, size, tone,
}: StatTileProps) {
  return (
    <div className={cn("bg-card border border-border rounded-xl p-4", className)}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className={valueClass({ size, tone })}>{value}</div>
      {(hint || delta) && (
        <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
          {delta && (
            <span className={cn(
              "tabular-nums font-medium",
              delta.value > 0 ? "text-success" : delta.value < 0 ? "text-danger" : "text-muted-foreground"
            )}>
              {delta.value > 0 ? "+" : ""}{delta.value.toFixed(2)}{delta.suffix ?? "%"}
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}
