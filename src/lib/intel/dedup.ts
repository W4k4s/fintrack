import { createHash } from "crypto";

/**
 * Build a deterministic dedup key for a signal.
 *
 * Reglas:
 * - `scope` y `asset` siempre entran (un dip de BTC es distinto de un dip de ETH).
 * - `windowKey` agrupa eventos por ventana temporal (ej. "2026-04-18" para un dip
 *   diario, "2026-W16" para semanal). Así un mismo dip no vuelve a alertar en el
 *   siguiente tick del día.
 */
export function dedupKey(
  scope: string,
  asset: string | null | undefined,
  windowKey: string,
): string {
  const raw = `${scope}:${asset ?? "-"}:${windowKey}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 20);
}

export function dayWindowKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekWindowKey(d: Date): string {
  const year = d.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const diff = (d.getTime() - start.getTime()) / 86400000;
  const week = Math.floor((diff + start.getUTCDay()) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
