"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Drawer({
  open, onClose, children, className, side = "right",
}: {
  open: boolean; onClose: () => void;
  children: React.ReactNode; className?: string;
  side?: "right" | "bottom";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 z-50 flex", side === "bottom" ? "items-end" : "justify-end")}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        onClick={e => e.stopPropagation()}
        className={cn(
          "relative bg-card border-border-strong shadow-2xl flex flex-col overflow-hidden",
          side === "right"
            ? "w-full max-w-md border-l animate-in slide-in-from-right duration-300 max-md:max-w-none max-md:border-l-0 max-md:border-t max-md:rounded-t-2xl max-md:max-h-[90vh] max-md:mt-auto max-md:animate-in max-md:slide-in-from-bottom"
            : "w-full max-w-none border-t rounded-t-2xl max-h-[90vh] animate-in slide-in-from-bottom duration-300",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerHeader({
  title, eyebrow, onClose,
}: {
  title: string; eyebrow?: string; onClose?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            {eyebrow}
          </div>
        )}
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="p-1.5 hover:bg-elevated rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export function DrawerBody({
  children, className,
}: {
  children: React.ReactNode; className?: string;
}) {
  return <div className={cn("flex-1 overflow-y-auto p-5", className)}>{children}</div>;
}

export function DrawerFooter({
  children, className,
}: {
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("border-t border-border px-5 py-3 flex items-center gap-2", className)}>
      {children}
    </div>
  );
}
