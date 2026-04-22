"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open, onClose, children, className, size = "md",
}: {
  open: boolean; onClose: () => void;
  children: React.ReactNode; className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "bg-card border border-border-strong rounded-2xl p-6 w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200",
          sizes[size],
          className,
        )}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  title, onClose, description,
}: {
  title: string; onClose?: () => void; description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="p-1 hover:bg-elevated rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
