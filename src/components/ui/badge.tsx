import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1 font-medium rounded-full border whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-elevated text-muted-foreground border-border",
        success: "bg-success-soft text-success border-success/30",
        warn: "bg-warn-soft text-warn border-warn/30",
        danger: "bg-danger-soft text-danger border-danger/30",
        info: "bg-info-soft text-info border-info/30",
        solid: "bg-foreground text-background border-transparent",
      },
      size: {
        xs: "text-[9px] px-1.5 py-0.5",
        sm: "text-[10px] px-2 py-0.5",
        md: "text-xs px-2.5 py-1",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "sm",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}
