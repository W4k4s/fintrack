"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignalActions({
  id,
  currentStatus,
}: {
  id: number;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function update(status: string, snoozeHours?: number) {
    setPending(true);
    try {
      const body: Record<string, string> = { userStatus: status };
      if (status === "snoozed" && snoozeHours) {
        body.snoozeUntil = new Date(Date.now() + snoozeHours * 3600 * 1000).toISOString();
      }
      await fetch(`/api/intel/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function reanalyze() {
    setPending(true);
    try {
      await fetch(`/api/intel/${id}/reanalyze`, { method: "POST" });
      setTimeout(() => router.refresh(), 1500);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {currentStatus !== "read" && (
        <button
          onClick={() => update("read")}
          disabled={pending}
          title="Marcar como leída (R). Quita la señal del buzón de no-leídas. No afecta a nada más."
          className="px-3 py-1.5 rounded-lg border border-border hover:bg-[var(--hover-bg)] text-sm disabled:opacity-50"
        >
          Marcar leída <kbd className="ml-1 text-[10px] opacity-60">R</kbd>
        </button>
      )}
      <button
        onClick={() => update("acted")}
        disabled={pending}
        title="Marca la señal como actuada (E). Sirve como feedback: el sistema calcula hit-rate y ROI por scope a partir de las acted."
        className="px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 text-sm disabled:opacity-50"
      >
        ✓ Ejecutada <kbd className="ml-1 text-[10px] opacity-60">E</kbd>
      </button>
      <button
        onClick={() => update("snoozed", 24)}
        disabled={pending}
        title="Pospón 24h (S). La saca del buzón. Las órdenes de rebalance no se auto-matchean mientras está snoozed."
        className="px-3 py-1.5 rounded-lg border border-border hover:bg-[var(--hover-bg)] text-sm disabled:opacity-50"
      >
        Snooze 24h <kbd className="ml-1 text-[10px] opacity-60">S</kbd>
      </button>
      <button
        onClick={() => update("dismissed")}
        disabled={pending}
        title="No me interesa ni hoy ni nunca (I). Si este scope acumula muchos dismissed, se activa un cooldown que silencia los pings de Telegram para ese scope durante varios días."
        className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-[var(--hover-bg)] text-sm disabled:opacity-50"
      >
        Ignorar <kbd className="ml-1 text-[10px] opacity-60">I</kbd>
      </button>
      <button
        onClick={reanalyze}
        disabled={pending}
        className="ml-auto px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-sm disabled:opacity-50"
        title="Vuelve a lanzar Claude para re-generar el análisis"
      >
        ↻ Re-analizar
      </button>
    </div>
  );
}
