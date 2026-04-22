const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-danger",
  high: "bg-warn",
  med: "bg-info",
  low: "bg-muted-foreground/40",
};

export function SeverityBar({ severity }: { severity: string }) {
  return (
    <div
      className={`w-1 self-stretch rounded-full shrink-0 ${SEVERITY_CLASS[severity] ?? "bg-muted-foreground/40"}`}
      aria-label={`Severidad ${severity}`}
    />
  );
}
