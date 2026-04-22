import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const card = cva(
  "rounded-xl border transition-colors",
  {
    variants: {
      tone: {
        default: "bg-card border-border",
        elevated: "bg-elevated border-border-strong",
        muted: "bg-muted/30 border-border",
        success: "bg-success-soft border-success/30",
        warn: "bg-warn-soft border-warn/30",
        danger: "bg-danger-soft border-danger/30",
        info: "bg-info-soft border-info/30",
      },
      padding: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-5",
        xl: "p-6",
      },
      interactive: {
        true: "hover:border-border-strong cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      tone: "default",
      padding: "md",
      interactive: false,
    },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof card> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, padding, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(card({ tone, padding, interactive }), className)} {...props} />
  ),
);
Card.displayName = "Card";

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 mb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-foreground flex items-center gap-2", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 pt-3 border-t border-border", className)} {...props} />;
}
