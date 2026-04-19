import { db, schema } from "@/lib/db";
import { and, desc, gte, isNull, eq, or } from "drizzle-orm";
import { fetchVix, type VixSnapshot } from "./market/vix";
import type { Severity } from "./types";

/**
 * Daily pre-open briefing (L-V ~08:30 Madrid). Complementa el weekly digest
 * dominical: es corto, accionable, centrado en "qué ha pasado esta noche y
 * qué tengo que mirar antes de que abra Europa".
 *
 * Contenido:
 *  - Overnight BTC / ETH (24h change, EUR).
 *  - VIX nivel + Δ día.
 *  - Fear & Greed actual vs ayer.
 *  - Signals nuevas últimas 12h (recuento + top 2 unread).
 *  - Orders rebalance próximas a expirar (>12d) — nudge para no dejarlas stale.
 *
 * Se emite SOLO en días laborables (Madrid). Sin quiet-hours ni cooldowns —
 * por diseño, es un digest fijo que el usuario espera.
 */

const SEVERITY_EMOJI: Record<Severity, string> = {
  low: "·",
  med: "●",
  high: "▲",
  critical: "🔴",
};

export interface DailyDigestContext {
  btc24hPct: number | null;
  eth24hPct: number | null;
  vix: VixSnapshot | null;
  fgNow: number | null;
  fgPrev: number | null;
  newSignalsLast12h: {
    total: number;
    bySeverity: Record<Severity, number>;
    topUnread: Array<{ id: number; title: string; severity: Severity; scope: string }>;
  };
  ordersExpiringSoon: Array<{ id: number; type: string; assetSymbol: string | null; venue: string; amountEur: number; daysLeft: number }>;
}

async function fetchCryptoPct(coingeckoId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=eur&include_24hr_change=true`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pct = data?.[coingeckoId]?.eur_24h_change;
    return typeof pct === "number" ? pct : null;
  } catch {
    return null;
  }
}

async function fetchFgLastTwo(): Promise<{ now: number | null; prev: number | null }> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=2", {
      next: { revalidate: 900 },
    });
    if (!res.ok) return { now: null, prev: null };
    const data = await res.json();
    const items: Array<{ value: string }> = data?.data ?? [];
    const now = items[0]?.value ? Number(items[0].value) : null;
    const prev = items[1]?.value ? Number(items[1].value) : null;
    return { now, prev };
  } catch {
    return { now: null, prev: null };
  }
}

async function loadNewSignalsLast12h(now: Date): Promise<DailyDigestContext["newSignalsLast12h"]> {
  const since = new Date(now.getTime() - 12 * 3600_000).toISOString();
  const rows = await db
    .select({
      id: schema.intelSignals.id,
      title: schema.intelSignals.title,
      severity: schema.intelSignals.severity,
      scope: schema.intelSignals.scope,
      userStatus: schema.intelSignals.userStatus,
    })
    .from(schema.intelSignals)
    .where(gte(schema.intelSignals.createdAt, since))
    .orderBy(desc(schema.intelSignals.createdAt))
    .limit(50);

  const bySeverity: Record<Severity, number> = { low: 0, med: 0, high: 0, critical: 0 };
  for (const r of rows) {
    if (r.severity in bySeverity) bySeverity[r.severity as Severity]++;
  }

  const severityRank: Record<Severity, number> = { low: 0, med: 1, high: 2, critical: 3 };
  const topUnread = rows
    .filter((r) => r.userStatus === "unread")
    .sort((a, b) => severityRank[b.severity as Severity] - severityRank[a.severity as Severity])
    .slice(0, 2)
    .map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity as Severity,
      scope: r.scope,
    }));

  return { total: rows.length, bySeverity, topUnread };
}

async function loadOrdersExpiringSoon(now: Date): Promise<DailyDigestContext["ordersExpiringSoon"]> {
  // Orders pending/needs_pick creadas hace ≥12d (quedan ≤2d antes de stale a los 14d).
  const cutoff = new Date(now.getTime() - 12 * 86400_000).toISOString();
  const rows = await db
    .select({
      id: schema.intelRebalanceOrders.id,
      type: schema.intelRebalanceOrders.type,
      assetSymbol: schema.intelRebalanceOrders.assetSymbol,
      venue: schema.intelRebalanceOrders.venue,
      amountEur: schema.intelRebalanceOrders.amountEur,
      createdAt: schema.intelRebalanceOrders.createdAt,
      status: schema.intelRebalanceOrders.status,
    })
    .from(schema.intelRebalanceOrders)
    .where(
      and(
        or(
          eq(schema.intelRebalanceOrders.status, "pending"),
          eq(schema.intelRebalanceOrders.status, "needs_pick"),
        ),
        gte(schema.intelRebalanceOrders.createdAt, "1970-01-01"),
      ),
    );

  const nearExpiry = rows
    .filter((r) => r.createdAt < cutoff)
    .map((r) => {
      const ageMs = now.getTime() - Date.parse(r.createdAt);
      const daysLeft = Math.max(0, 14 - Math.floor(ageMs / 86400_000));
      return {
        id: r.id,
        type: r.type,
        assetSymbol: r.assetSymbol,
        venue: r.venue,
        amountEur: r.amountEur,
        daysLeft,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  return nearExpiry;
}

export async function buildDailyDigest(now: Date = new Date()): Promise<DailyDigestContext> {
  const [btc24hPct, eth24hPct, vix, fg, newSignals, ordersExpiring] = await Promise.all([
    fetchCryptoPct("bitcoin"),
    fetchCryptoPct("ethereum"),
    fetchVix(),
    fetchFgLastTwo(),
    loadNewSignalsLast12h(now),
    loadOrdersExpiringSoon(now),
  ]);

  return {
    btc24hPct,
    eth24hPct,
    vix,
    fgNow: fg.now,
    fgPrev: fg.prev,
    newSignalsLast12h: newSignals,
    ordersExpiringSoon: ordersExpiring,
  };
}

function pctFmt(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function arrow(v: number | null): string {
  if (v == null) return "→";
  if (v > 0.3) return "↑";
  if (v < -0.3) return "↓";
  return "→";
}

export function formatDailyDigest(ctx: DailyDigestContext, now: Date = new Date()): string {
  const dateStr = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Madrid",
  });

  const lines: string[] = [`☀️ Briefing ${dateStr}`];

  const btcLine = `BTC ${arrow(ctx.btc24hPct)} ${pctFmt(ctx.btc24hPct)} · ETH ${arrow(ctx.eth24hPct)} ${pctFmt(ctx.eth24hPct)}`;
  lines.push(btcLine);

  if (ctx.vix) {
    const vixChange = pctFmt(ctx.vix.changePct);
    const vixFlag = ctx.vix.level >= 30 ? " ⚠" : ctx.vix.level >= 20 ? " !" : "";
    lines.push(`VIX ${ctx.vix.level.toFixed(1)} (${vixChange})${vixFlag}`);
  } else {
    lines.push("VIX —");
  }

  if (ctx.fgNow != null) {
    const delta = ctx.fgPrev != null ? ctx.fgNow - ctx.fgPrev : null;
    const deltaStr = delta != null ? ` (${delta >= 0 ? "+" : ""}${delta})` : "";
    const regime = ctx.fgNow <= 25 ? " miedo extremo" : ctx.fgNow >= 75 ? " codicia extrema" : "";
    lines.push(`F&G ${ctx.fgNow}${deltaStr}${regime}`);
  }

  const sig = ctx.newSignalsLast12h;
  if (sig.total > 0) {
    const sevBreakdown: string[] = [];
    if (sig.bySeverity.critical > 0) sevBreakdown.push(`${sig.bySeverity.critical}🔴`);
    if (sig.bySeverity.high > 0) sevBreakdown.push(`${sig.bySeverity.high}▲`);
    if (sig.bySeverity.med > 0) sevBreakdown.push(`${sig.bySeverity.med}●`);
    if (sig.bySeverity.low > 0) sevBreakdown.push(`${sig.bySeverity.low}·`);
    lines.push("");
    lines.push(`📬 ${sig.total} señales nuevas (12h): ${sevBreakdown.join(" ")}`);
    for (const s of sig.topUnread) {
      lines.push(`${SEVERITY_EMOJI[s.severity]} [${s.scope}] ${s.title}`);
    }
  }

  if (ctx.ordersExpiringSoon.length > 0) {
    lines.push("");
    lines.push(`⏳ Orders por expirar:`);
    for (const o of ctx.ordersExpiringSoon) {
      lines.push(`  ${o.type} ${o.assetSymbol ?? "?"} ${Math.round(o.amountEur)}€ @ ${o.venue} — ${o.daysLeft}d`);
    }
  }

  return lines.join("\n");
}

/**
 * Devuelve true si `now` (Madrid) es L-V.
 */
export function isWeekdayMadrid(now: Date = new Date()): boolean {
  const weekdayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
  }).format(now);
  return weekdayStr !== "Sat" && weekdayStr !== "Sun";
}
