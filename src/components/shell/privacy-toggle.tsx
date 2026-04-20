"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/components/privacy-provider";
import { cn } from "@/lib/utils";

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      aria-label={hidden ? "Mostrar cifras" : "Ocultar cifras (modo privacidad)"}
      title={hidden ? "Mostrar cifras" : "Ocultar cifras (modo privacidad)"}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors",
        hidden
          ? "bg-warn-soft text-warn hover:bg-warn-soft/80"
          : "text-muted-foreground hover:text-foreground hover:bg-[var(--hover-bg)]",
      )}
    >
      {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}
