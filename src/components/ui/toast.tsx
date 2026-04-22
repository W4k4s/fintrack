"use client";
import * as React from "react";
import { CheckCircle2, XCircle, Info as InfoIcon, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "danger" | "warn" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastCtx {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id" | "duration"> & { duration?: number }) => void;
  dismiss: (id: number) => void;
}

const Ctx = React.createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4" />,
  danger: <XCircle className="w-4 h-4" />,
  warn: <AlertTriangle className="w-4 h-4" />,
  info: <InfoIcon className="w-4 h-4" />,
};

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "bg-success-soft text-success border-success/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  info: "bg-info-soft text-info border-info/30",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback<ToastCtx["push"]>(
    ({ duration = 4000, ...t }) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...t, id, duration }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ toasts, push, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 p-3 pr-10 rounded-lg border shadow-lg max-w-sm animate-in slide-in-from-bottom-2 duration-200 relative",
              TONE_CLASSES[t.tone],
            )}
            role="status"
          >
            <span className="mt-0.5 shrink-0">{ICONS[t.tone]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <div className="text-xs mt-0.5 opacity-80">{t.description}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="absolute top-2 right-2 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
