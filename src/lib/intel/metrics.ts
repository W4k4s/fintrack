import { db, schema } from "@/lib/db";
import { gte, inArray } from "drizzle-orm";

export interface ExecutionStats {
  ordersTotal: number;
  ordersExecuted: number;
  ordersDismissed: number;
  ordersStale: number;
  ordersSuperseded: number;
  ordersPending: number;
  ordersNeedsPick: number;
  executionRate: number; // executed / (total - superseded)
  plannedAmountEur: number;
  executedAmountEur: number;
}

export interface ScopeMetrics {
  scope: string;
  total: number;
  bySeverity: Record<"critical" | "high" | "med" | "low", number>;
  byUserStatus: Record<"unread" | "read" | "acted" | "dismissed" | "snoozed", number>;
  dismissedRate: number;
  actedRate: number;
  ignoredRate: number;
  timeToActionMedianHours: number | null;
  actedRateHighSeverity: number;
  actedRateLowSeverity: number;
  highSeverityTotal: number;
  lowSeverityTotal: number;
  notificationsSent: number;
  notificationsSuppressed: number;
  activeCooldown: {
    until: string;
    reason: string;
    dismissedRate: number | null;
  } | null;
  executionStats?: ExecutionStats;
}

export interface IntelMetricsSnapshot {
  windowDays: number;
  since: string;
  totalSignals: number;
  scopes: ScopeMetrics[];
}

const COOLDOWN_DISMISS_THRESHOLD = 0.7;
const COOLDOWN_MIN_SAMPLES = 5;
export const IGNORED_AFTER_DAYS = 7;

interface SignalRow {
  id: number;
  scope: string;
  severity: string;
  userStatus: string;
  createdAt: string;
  resolvedAt: string | null;
  assetClass: string | null;
  payload: string;
}

interface OrderRow {
  signalId: number;
  status: string;
  amountEur: number;
  actualAmountEur: number | null;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function isIgnored(
  sig: { userStatus: string; resolvedAt: string | null; createdAt: string },
  nowMs: number,
  ignoreAfterDays = IGNORED_AFTER_DAYS,
): boolean {
  if (sig.resolvedAt) return false;
  if (sig.userStatus !== "unread" && sig.userStatus !== "read") return false;
  const ageMs = nowMs - Date.parse(sig.createdAt);
  return ageMs >= ignoreAfterDays * 86400_000;
}

export function timeToActionHours(sig: {
  userStatus: string;
  createdAt: string;
  resolvedAt: string | null;
}): number | null {
  if (sig.userStatus !== "acted" || !sig.resolvedAt) return null;
  const ms = Date.parse(sig.resolvedAt) - Date.parse(sig.createdAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3600_000;
}

export function computeExecutionStats(orders: OrderRow[]): ExecutionStats {
  const stats: ExecutionStats = {
    ordersTotal: orders.length,
    ordersExecuted: 0,
    ordersDismissed: 0,
    ordersStale: 0,
    ordersSuperseded: 0,
    ordersPending: 0,
    ordersNeedsPick: 0,
    executionRate: 0,
    plannedAmountEur: 0,
    executedAmountEur: 0,
  };
  for (const o of orders) {
    stats.plannedAmountEur += o.amountEur;
    switch (o.status) {
      case "executed":
        stats.ordersExecuted++;
        stats.executedAmountEur += o.actualAmountEur ?? o.amountEur;
        break;
      case "dismissed":
        stats.ordersDismissed++;
        break;
      case "stale":
        stats.ordersStale++;
        break;
      case "superseded":
        stats.ordersSuperseded++;
        break;
      case "pending":
        stats.ordersPending++;
        break;
      case "needs_pick":
        stats.ordersNeedsPick++;
        break;
    }
  }
  const actionable = stats.ordersTotal - stats.ordersSuperseded;
  stats.executionRate = actionable > 0 ? stats.ordersExecuted / actionable : 0;
  return stats;
}

function isDriftAggregateSignal(sig: SignalRow): boolean {
  if (sig.scope !== "drift") return false;
  if (sig.assetClass !== null) return false;
  try {
    const p = JSON.parse(sig.payload);
    return p && typeof p === "object" && p.plan != null;
  } catch {
    return false;
  }
}

export async function computeIntelMetrics(windowDays = 30): Promise<IntelMetricsSnapshot> {
  const nowMs = Date.now();
  const since = new Date(nowMs - windowDays * 86400_000).toISOString();

  const signals = (await db
    .select({
      id: schema.intelSignals.id,
      scope: schema.intelSignals.scope,
      severity: schema.intelSignals.severity,
      userStatus: schema.intelSignals.userStatus,
      createdAt: schema.intelSignals.createdAt,
      resolvedAt: schema.intelSignals.resolvedAt,
      assetClass: schema.intelSignals.assetClass,
      payload: schema.intelSignals.payload,
    })
    .from(schema.intelSignals)
    .where(gte(schema.intelSignals.createdAt, since))) as SignalRow[];

  const notifications = await db
    .select({
      signalId: schema.intelNotifications.signalId,
      status: schema.intelNotifications.status,
      channel: schema.intelNotifications.channel,
    })
    .from(schema.intelNotifications)
    .where(gte(schema.intelNotifications.createdAt, since));

  const cooldowns = await db.select().from(schema.intelScopeCooldowns);
  const nowIso = new Date(nowMs).toISOString();
  const cooldownByScope = new Map(
    cooldowns.filter((c) => c.cooldownUntil > nowIso).map((c) => [c.scope, c]),
  );

  const driftAggregateIds = signals.filter(isDriftAggregateSignal).map((s) => s.id);
  const driftOrders: OrderRow[] =
    driftAggregateIds.length > 0
      ? ((await db
          .select({
            signalId: schema.intelRebalanceOrders.signalId,
            status: schema.intelRebalanceOrders.status,
            amountEur: schema.intelRebalanceOrders.amountEur,
            actualAmountEur: schema.intelRebalanceOrders.actualAmountEur,
          })
          .from(schema.intelRebalanceOrders)
          .where(inArray(schema.intelRebalanceOrders.signalId, driftAggregateIds))) as OrderRow[])
      : [];

  const byScope = new Map<string, ScopeMetrics>();
  const actionHoursByScope = new Map<string, number[]>();
  const ensure = (scope: string): ScopeMetrics => {
    let m = byScope.get(scope);
    if (!m) {
      m = {
        scope,
        total: 0,
        bySeverity: { critical: 0, high: 0, med: 0, low: 0 },
        byUserStatus: { unread: 0, read: 0, acted: 0, dismissed: 0, snoozed: 0 },
        dismissedRate: 0,
        actedRate: 0,
        ignoredRate: 0,
        timeToActionMedianHours: null,
        actedRateHighSeverity: 0,
        actedRateLowSeverity: 0,
        highSeverityTotal: 0,
        lowSeverityTotal: 0,
        notificationsSent: 0,
        notificationsSuppressed: 0,
        activeCooldown: null,
      };
      byScope.set(scope, m);
    }
    return m;
  };

  const sigScopeById = new Map<number, string>();
  let ignoredGlobal = 0;
  const ignoredByScope = new Map<string, number>();
  const actedHighByScope = new Map<string, number>();
  const actedLowByScope = new Map<string, number>();

  for (const s of signals) {
    const m = ensure(s.scope);
    m.total++;
    if (s.severity in m.bySeverity) {
      m.bySeverity[s.severity as keyof typeof m.bySeverity]++;
    }
    if (s.userStatus in m.byUserStatus) {
      m.byUserStatus[s.userStatus as keyof typeof m.byUserStatus]++;
    }
    sigScopeById.set(s.id, s.scope);

    const isHigh = s.severity === "critical" || s.severity === "high";
    if (isHigh) m.highSeverityTotal++;
    else m.lowSeverityTotal++;

    if (s.userStatus === "acted") {
      if (isHigh) actedHighByScope.set(s.scope, (actedHighByScope.get(s.scope) ?? 0) + 1);
      else actedLowByScope.set(s.scope, (actedLowByScope.get(s.scope) ?? 0) + 1);
    }

    if (isIgnored(s, nowMs)) {
      ignoredGlobal++;
      ignoredByScope.set(s.scope, (ignoredByScope.get(s.scope) ?? 0) + 1);
    }

    const hours = timeToActionHours(s);
    if (hours != null) {
      const arr = actionHoursByScope.get(s.scope) ?? [];
      arr.push(hours);
      actionHoursByScope.set(s.scope, arr);
    }
  }

  for (const n of notifications) {
    if (n.signalId == null) continue;
    const scope = sigScopeById.get(n.signalId);
    if (!scope) continue;
    const m = ensure(scope);
    if (n.channel === "telegram" || n.channel === "both") {
      if (n.status === "sent") m.notificationsSent++;
      else if (n.status === "suppressed") m.notificationsSuppressed++;
    }
  }

  for (const m of byScope.values()) {
    m.dismissedRate = m.total > 0 ? m.byUserStatus.dismissed / m.total : 0;
    m.actedRate = m.total > 0 ? m.byUserStatus.acted / m.total : 0;
    m.ignoredRate = m.total > 0 ? (ignoredByScope.get(m.scope) ?? 0) / m.total : 0;
    m.actedRateHighSeverity =
      m.highSeverityTotal > 0 ? (actedHighByScope.get(m.scope) ?? 0) / m.highSeverityTotal : 0;
    m.actedRateLowSeverity =
      m.lowSeverityTotal > 0 ? (actedLowByScope.get(m.scope) ?? 0) / m.lowSeverityTotal : 0;
    m.timeToActionMedianHours = median(actionHoursByScope.get(m.scope) ?? []);
    const cd = cooldownByScope.get(m.scope);
    if (cd) {
      m.activeCooldown = {
        until: cd.cooldownUntil,
        reason: cd.reason,
        dismissedRate: cd.dismissedRate ?? null,
      };
    }
  }

  const driftScope = byScope.get("drift");
  if (driftScope) {
    driftScope.executionStats = computeExecutionStats(driftOrders);
  }

  const scopes = [...byScope.values()].sort((a, b) => b.total - a.total);
  return {
    windowDays,
    since,
    totalSignals: signals.length,
    scopes,
  };
}

export const COOLDOWN_CONFIG = {
  dismissThreshold: COOLDOWN_DISMISS_THRESHOLD,
  minSamples: COOLDOWN_MIN_SAMPLES,
  durationDays: 7,
  windowDays: 30,
};
