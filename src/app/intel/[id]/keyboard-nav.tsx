"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts for the signal detail page. Mount once per page.
 *
 *   ← / →    Anterior / Siguiente signal in the current buzón
 *   R        Marcar leída (only if not already read)
 *   E        Ejecutada (acted)
 *   S        Snooze 24h
 *   I        Ignorar (dismissed)
 *
 * Ignored when the user is typing in an input/textarea/contentEditable or
 * when any modifier key is held.
 */
export function KeyboardNav({
  id,
  currentStatus,
  prevHref,
  nextHref,
}: {
  id: number;
  currentStatus: string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();

  const update = useCallback(
    async (status: string, snoozeHours?: number) => {
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
    },
    [id, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      if (e.key === "ArrowLeft" && prevHref) {
        e.preventDefault();
        router.push(prevHref);
        return;
      }
      if (e.key === "ArrowRight" && nextHref) {
        e.preventDefault();
        router.push(nextHref);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "e") {
        e.preventDefault();
        update("acted");
      } else if (k === "r" && currentStatus !== "read") {
        e.preventDefault();
        update("read");
      } else if (k === "s") {
        e.preventDefault();
        update("snoozed", 24);
      } else if (k === "i") {
        e.preventDefault();
        update("dismissed");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router, update, currentStatus]);

  return null;
}
