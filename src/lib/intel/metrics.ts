import { db, schema } from "@/lib/db";
import { gte } from "drizzle-orm";

export interface ScopeMetrics {
  scope: string;
  total: number;
  bySeverity: Record<"critical" | "high" | "med" | "low", number>;
  byUserStatus: Record<"unread" | "read" | "acted" | "dismissed" | "snoozed", number>;
  dismissedRate: number;
  actedRate: number;
  notificationsSent: number;
  notificationsSuppressed: number;
  activeCooldown: {
    until: string;
    reason: string;
    dismissedRate: number | null;
  } | null;
}

export interface IntelMetricsSnapshot {
  windowDays: number;
  since: string;
  totalSignals: number;
  scopes: ScopeMetrics[];
}

const COOLDOWN_DISMISS_THRESHOLD = 0.7;
const COOLDOWN_MIN_SAMPLES = 5;

export async function computeIntelMetrics(windowDays = 30): Promise<IntelMetricsSnapshot> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const signals = await db
    .select({
      scope: schema.intelSignals.scope,
      severity: schema.intelSignals.severity,
      userStatus: schema.intelSignals.userStatus,
      id: schema.intelSignals.id,
    })
    .from(schema.intelSignals)
    .where(gte(schema.intelSignals.createdAt, since));

  const notifications = await db
    .select({
      signalId: schema.intelNotifications.signalId,
      status: schema.intelNotifications.status,
      channel: schema.intelNotifications.channel,
    })
    .from(schema.intelNotifications)
    .where(gte(schema.intelNotifications.createdAt, since));

  const cooldowns = await db.select().from(schema.intelScopeCooldowns);
  const nowIso = new Date().toISOString();
  const cooldownByScope = new Map(
    cooldowns
      .filter((c) => c.cooldownUntil > nowIso)
      .map((c) => [c.scope, c]),
  );

  const byScope = new Map<string, ScopeMetrics>();
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
        notificationsSent: 0,
        notificationsSuppressed: 0,
        activeCooldown: null,
      };
      byScope.set(scope, m);
    }
    return m;
  };

  const sigScopeById = new Map<number, string>();
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
    const cd = cooldownByScope.get(m.scope);
    if (cd) {
      m.activeCooldown = {
        until: cd.cooldownUntil,
        reason: cd.reason,
        dismissedRate: cd.dismissedRate ?? null,
      };
    }
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
