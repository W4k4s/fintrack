import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full px-3 py-2 bg-elevated border border-border-strong rounded-lg text-sm",
        "focus:outline-none focus:border-info/50 focus:ring-2 focus:ring-info/20",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "placeholder:text-muted-foreground",
        type === "number" ? "tabular-nums" : "",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs text-muted-foreground mb-1 block", className)}
      {...props}
    />
  );
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[10px] text-muted-foreground mt-1", className)} {...props} />;
}
