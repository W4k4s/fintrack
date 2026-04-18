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
        const until = new Date(Date.now() + snoozeHours * 3600 * 1000).toISOString();
        body.snoozeUntil = until;
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
      // Damos tiempo a Claude (30-60s) pero refrescamos rápido para mostrar el estado "procesando"
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
          className="px-3 py-1.5 rounded-lg border border-border hover:bg-[var(--hover-bg)] text-sm disabled:opacity-50"
        >
          Marcar leída
        </button>
      )}
      <button
        onClick={() => update("acted")}
        disabled={pending}
        className="px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 text-sm disabled:opacity-50"
      >
        ✓ Ejecutada
      </button>
      <button
        onClick={() => update("snoozed", 24)}
        disabled={pending}
        className="px-3 py-1.5 rounded-lg border border-border hover:bg-[var(--hover-bg)] text-sm disabled:opacity-50"
      >
        Snooze 24h
      </button>
      <button
        onClick={() => update("dismissed")}
        disabled={pending}
        className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-[var(--hover-bg)] text-sm disabled:opacity-50"
      >
        Ignorar
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
