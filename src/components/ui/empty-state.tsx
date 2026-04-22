import { cn } from "@/lib/utils";

export function EmptyState({
  icon, title, description, action, className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "border border-dashed border-border rounded-xl p-12 text-center bg-card/40",
      className,
    )}>
      {icon && (
        <div className="mb-3 inline-flex items-center justify-center w-12 h-12 rounded-full bg-elevated text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
