"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntelRebalanceOrder } from "@/lib/db/schema";

const CLASS_LABEL: Record<string, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etfs: "ETFs",
  gold: "Gold",
  bonds: "Bonds",
  stocks: "Stocks",
};

const VENUE_LABEL: Record<string, string> = {
  binance: "Binance",
  mexc: "MEXC",
  kucoin: "KuCoin",
  "trade-republic": "Trade Republic",
  "coinbase": "Coinbase",
};

function eur(v: number): string {
  return `${Math.round(v).toLocaleString("es-ES")}€`;
}

function venueLabel(v: string): string {
  return VENUE_LABEL[v] ?? v;
}

type ActiveState = IntelRebalanceOrder["status"];

export function RebalanceOrdersChecklist({
  initialOrders,
}: {
  initialOrders: IntelRebalanceOrder[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  async function patch(
    id: number,
    status: "executed" | "dismissed" | "pending",
    opts: { actualAmountEur?: number } = {},
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/intel/orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...opts }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Error: ${body.error ?? res.statusText}`);
        return;
      }
      const { order } = (await res.json()) as { order: IntelRebalanceOrder };
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  function markExecuted(o: IntelRebalanceOrder) {
    const planned = o.amountEur;
    const input = window.prompt(
      `Importe real ejecutado en €\n(plan: ${planned}€)`,
      String(planned),
    );
    if (input === null) return; // cancelled
    const actual = Number(input.replace(",", "."));
    if (!Number.isFinite(actual) || actual < 0) {
      alert("Importe inválido");
      return;
    }
    void patch(o.id, "executed", { actualAmountEur: actual });
  }

  const sells = orders.filter((o) => o.type === "sell");
  const buys = orders.filter((o) => o.type === "buy");

  const actionable = orders.filter(
    (o) => !["superseded", "stale"].includes(o.status),
  );
  const executedCount = actionable.filter((o) => o.status === "executed").length;
  const partialCount = actionable.filter((o) => o.status === "partial").length;
  const dismissedCount = actionable.filter((o) => o.status === "dismissed").length;
  const totalActionable = actionable.length;
  const closed = executedCount + partialCount + dismissedCount;
  const progressPct =
    totalActionable > 0 ? Math.round((closed / totalActionable) * 100) : 0;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">
          Ejecución: {executedCount} ejecutadas
          {partialCount > 0 ? ` · ${partialCount} parciales` : ""} · {dismissedCount} saltadas ·{" "}
          {totalActionable - closed} pendientes
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          {progressPct}%
        </div>
      </div>
      <div className="h-1.5 bg-[var(--hover-bg)] rounded overflow-hidden mb-4">
        <div
          className="h-full bg-green-500/60 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {sells.length > 0 && (
        <OrderTable
          title="Vender"
          orders={sells}
          busyId={busyId}
          disabled={isPending}
          onExecute={markExecuted}
          onDismiss={(o) => void patch(o.id, "dismissed")}
          onRevert={(o) => void patch(o.id, "pending")}
        />
      )}

      {buys.length > 0 && (
        <OrderTable
          title="Comprar"
          orders={buys}
          busyId={busyId}
          disabled={isPending}
          onExecute={markExecuted}
          onDismiss={(o) => void patch(o.id, "dismissed")}
          onRevert={(o) => void patch(o.id, "pending")}
        />
      )}
    </div>
  );
}

function OrderTable({
  title,
  orders,
  busyId,
  disabled,
  onExecute,
  onDismiss,
  onRevert,
}: {
  title: string;
  orders: IntelRebalanceOrder[];
  busyId: number | null;
  disabled: boolean;
  onExecute: (o: IntelRebalanceOrder) => void;
  onDismiss: (o: IntelRebalanceOrder) => void;
  onRevert: (o: IntelRebalanceOrder) => void;
}) {
  return (
    <div className="mb-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left pb-1 font-normal">Estado</th>
            <th className="text-left pb-1 font-normal">Activo</th>
            <th className="text-left pb-1 font-normal">Venue</th>
            <th className="text-right pb-1 font-normal">Plan</th>
            <th className="text-right pb-1 font-normal">Real</th>
            <th className="text-right pb-1 font-normal">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const busy = busyId === o.id || disabled;
            return (
              <tr key={o.id} className="border-t border-border">
                <td className="py-1.5">
                  <StatusBadge status={o.status as ActiveState} />
                </td>
                <td className="py-1.5 font-mono">
                  {o.status === "needs_pick" ? (
                    <span className="text-amber-300">
                      ⚠ Elegir ({CLASS_LABEL[o.assetClass] ?? o.assetClass})
                    </span>
                  ) : (
                    o.assetSymbol ?? "—"
                  )}
                </td>
                <td className="py-1.5 text-muted-foreground">
                  {venueLabel(o.venue)}
                </td>
                <td className="py-1.5 text-right font-mono">{eur(o.amountEur)}</td>
                <td className="py-1.5 text-right font-mono text-muted-foreground">
                  {o.actualAmountEur != null ? eur(o.actualAmountEur) : "—"}
                </td>
                <td className="py-1.5 text-right">
                  <RowActions
                    order={o}
                    busy={busy}
                    onExecute={() => onExecute(o)}
                    onDismiss={() => onDismiss(o)}
                    onRevert={() => onRevert(o)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: ActiveState }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending: { label: "pending", cls: "text-muted-foreground" },
    executed: {
      label: "✓ ejecutada",
      cls: "text-green-400",
    },
    partial: { label: "◐ parcial", cls: "text-yellow-400" },
    dismissed: { label: "⏭ saltada", cls: "text-muted-foreground" },
    needs_pick: { label: "⚠ pick", cls: "text-amber-300" },
    superseded: { label: "superseded", cls: "text-muted-foreground opacity-60" },
    stale: { label: "stale", cls: "text-muted-foreground opacity-60" },
  };
  const c = cfg[status] ?? cfg.pending;
  return <span className={`text-xs font-mono ${c.cls}`}>{c.label}</span>;
}

function RowActions({
  order,
  busy,
  onExecute,
  onDismiss,
  onRevert,
}: {
  order: IntelRebalanceOrder;
  busy: boolean;
  onExecute: () => void;
  onDismiss: () => void;
  onRevert: () => void;
}) {
  if (order.status === "superseded" || order.status === "stale") {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  if (order.status === "executed" || order.status === "partial" || order.status === "dismissed") {
    return (
      <button
        onClick={onRevert}
        disabled={busy}
        className="px-2 py-0.5 text-xs rounded border border-border hover:bg-[var(--hover-bg)] disabled:opacity-50"
        title="Revertir a pending"
      >
        ↩
      </button>
    );
  }
  return (
    <div className="flex gap-1 justify-end">
      <button
        onClick={onExecute}
        disabled={busy || order.status === "needs_pick"}
        className="px-2 py-0.5 text-xs rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 disabled:opacity-50"
        title={
          order.status === "needs_pick"
            ? "Elige activo en /strategy antes de ejecutar"
            : "Marcar ejecutada con importe real"
        }
      >
        ✓
      </button>
      <button
        onClick={onDismiss}
        disabled={busy}
        className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:bg-[var(--hover-bg)] disabled:opacity-50"
        title="Saltar"
      >
        ⏭
      </button>
    </div>
  );
}
