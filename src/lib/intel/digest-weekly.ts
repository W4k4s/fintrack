import { db, schema } from "@/lib/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { ASSET_CLASSES, classifyAsset, type AssetClass } from "./allocation/classify";
import { computeAllocation } from "./allocation/compute";
import { loadMultiplierContext, multiplierFor, type MultiplierContext } from "./multipliers";
import { parsePolicies, type StrategyPolicies } from "../strategy/policies";
import type { Severity } from "./types";

const CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etfs: "ETFs",
  gold: "Gold",
  bonds: "Bonds",
  stocks: "Stocks",
};

const SEVERITY_RANK: Record<Severity, number> = { low: 0, med: 1, high: 2, critical: 3 };
const SEVERITY_EMOJI: Record<Severity, string> = {
  low: "·",
  med: "●",
  high: "▲",
  critical: "🔴",
};

export interface WeeklyDigest {
  text: string;
  context: {
    netWorthEur: number;
    netWorthDeltaEur: number;
    netWorthDeltaPct: number | null;
    allocation: Record<AssetClass, { actualPct: number; targetPct: number; driftPp: number }>;
    multipliers: Record<string, number>;
    signalsBySeverity: Record<Severity, number>;
    topUnread: Array<{ id: number; title: string; severity: Severity; scope: string }>;
    dca: { weeklyBudget: number; thisWeekExecuted: number; thisWeekRemaining: number };
    markets: { fg: number; fgPrev: number | null; btcBasisPct: number | null; vix: number | null };
  };
}

function eurFmt(v: number): string {
  const sign = v >= 0 ? "" : "-";
  const abs = Math.abs(Math.round(v));
  return `${sign}${abs.toLocaleString("es-ES")}€`;
}

function pctFmt(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function ppFmt(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}pp`;
}

function arrow(delta: number): string {
  if (delta > 0.5) return "↑";
  if (delta < -0.5) return "↓";
  return "→";
}

function driftMark(absPp: number): string {
  if (absPp >= 15) return " ⚠";
  if (absPp >= 10) return " !";
  return "";
}

/** Lee snapshot más próximo a `daysAgo` días atrás (busca ±3 días si no exacto). */
async function findSnapshotNearDays(
  daysAgo: number,
): Promise<typeof schema.intelAllocationSnapshots.$inferSelect | null> {
  const target = new Date(Date.now() - daysAgo * 86_400_000);
  const lower = new Date(target.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const upper = new Date(target.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(schema.intelAllocationSnapshots)
    .where(
      and(
        gte(schema.intelAllocationSnapshots.date, lower),
        lte(schema.intelAllocationSnapshots.date, upper),
      ),
    )
    .orderBy(schema.intelAllocationSnapshots.date);
  if (rows.length === 0) return null;
  const targetIso = target.toISOString().slice(0, 10);
  let best = rows[0];
  let bestDiff = Math.abs(best.date.localeCompare(targetIso));
  for (const r of rows) {
    const diff = Math.abs(new Date(r.date).getTime() - target.getTime());
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }
  return best;
}

async function fetchFgHistory(limit = 8): Promise<number[]> {
  try {
    const res = await fetch(`https://api.alternative.me/fng/?limit=${limit}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data?.data) ? data.data : [];
    return raw
      .map((x: unknown) => Number((x as { value?: string }).value))
      .filter((n: number) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function renderMultipliers(ctx: MultiplierContext, policies?: StrategyPolicies) {
  const cryptoMult = multiplierFor("crypto", "BTC", ctx, policies).value;
  const etfsMult = multiplierFor("etfs", "MSCI World", ctx, policies).value;
  const goldMult = multiplierFor("gold", "Gold ETC", ctx, policies).value;
  return { crypto: cryptoMult, etfs: etfsMult, gold: goldMult };
}

export async function buildWeeklyDigest(now: Date = new Date()): Promise<WeeklyDigest> {
  // Allocation actual + snapshot hace 7 días.
  const alloc = await computeAllocation();
  const prev = await findSnapshotNearDays(7);
  const netWorthEur = alloc.netWorth;
  const prevNet = prev?.netWorthEur ?? 0;
  const netWorthDeltaEur = prevNet > 0 ? netWorthEur - prevNet : 0;
  const netWorthDeltaPct =
    prevNet > 0 ? ((netWorthEur - prevNet) / prevNet) * 100 : null;

  // Allocation con drift (buscar perfil activo para targets).
  const [profile] = await db
    .select()
    .from(schema.strategyProfiles)
    .where(eq(schema.strategyProfiles.active, true))
    .limit(1);
  const targets: Record<AssetClass, number> = {
    cash: Number(profile?.targetCash ?? 0),
    crypto: Number(profile?.targetCrypto ?? 0),
    etfs: Number(profile?.targetEtfs ?? 0),
    gold: Number(profile?.targetGold ?? 0),
    bonds: Number(profile?.targetBonds ?? 0),
    stocks: Number(profile?.targetStocks ?? 0),
  };
  const allocationOut = {} as Record<
    AssetClass,
    { actualPct: number; targetPct: number; driftPp: number }
  >;
  for (const cls of ASSET_CLASSES) {
    const actualPct = alloc.byClass[cls]?.pct ?? 0;
    const targetPct = targets[cls];
    allocationOut[cls] = {
      actualPct: Math.round(actualPct * 10) / 10,
      targetPct,
      driftPp: Math.round((actualPct - targetPct) * 10) / 10,
    };
  }

  // Market context y multipliers — R3: con policies del profile + allocation
  // crypto actual para que el gate policy-aware se active en el digest.
  const fgHistory = await fetchFgHistory(8);
  const fgNow = fgHistory[0] ?? 50;
  const fgPrev = fgHistory[7] ?? null;
  const policies = parsePolicies(profile?.policiesJson ?? null);
  const cryptoAllocationPct = allocationOut.crypto?.actualPct ?? 0;
  const mctx = await loadMultiplierContext(fgNow, { cryptoAllocationPct });
  const multipliers = renderMultipliers(mctx, policies);

  // Signals últimos 7 días.
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const recentSignals = await db
    .select({
      id: schema.intelSignals.id,
      title: schema.intelSignals.title,
      severity: schema.intelSignals.severity,
      scope: schema.intelSignals.scope,
      userStatus: schema.intelSignals.userStatus,
      createdAt: schema.intelSignals.createdAt,
    })
    .from(schema.intelSignals)
    .where(gte(schema.intelSignals.createdAt, since))
    .orderBy(desc(schema.intelSignals.createdAt));

  const signalsBySeverity: Record<Severity, number> = {
    low: 0,
    med: 0,
    high: 0,
    critical: 0,
  };
  for (const s of recentSignals) signalsBySeverity[s.severity]++;

  const unread = recentSignals
    .filter((s) => s.userStatus === "unread")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 3)
    .map((s) => ({
      id: s.id,
      title: s.title,
      severity: s.severity,
      scope: s.scope,
    }));

  // DCA esta semana (reproduce la lógica de /api/strategy/schedule).
  const weekStart = new Date(now);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const plans = await db.select().from(schema.investmentPlans);
  const activePlans = plans.filter((p) => p.enabled);
  const weeklyBudget = activePlans.reduce((acc, plan) => {
    const cls = (plan.assetClass as AssetClass | null) ?? classifyAsset(plan.asset);
    const applied = multiplierFor(cls, plan.asset, mctx, policies);
    const effectiveMonthly = Number(plan.amount ?? 0) * applied.value;
    return acc + effectiveMonthly / 4;
  }, 0);

  const executions = await db
    .select()
    .from(schema.dcaExecutions)
    .where(
      and(
        gte(schema.dcaExecutions.date, weekStartIso),
        lte(schema.dcaExecutions.date, weekEnd),
      ),
    );
  const thisWeekExecuted = executions.reduce((a, e) => a + Number(e.amount ?? 0), 0);
  const thisWeekRemaining = Math.max(0, weeklyBudget - thisWeekExecuted);

  const digest: WeeklyDigest["context"] = {
    netWorthEur,
    netWorthDeltaEur,
    netWorthDeltaPct,
    allocation: allocationOut,
    multipliers,
    signalsBySeverity,
    topUnread: unread,
    dca: {
      weeklyBudget: Math.round(weeklyBudget * 100) / 100,
      thisWeekExecuted: Math.round(thisWeekExecuted * 100) / 100,
      thisWeekRemaining: Math.round(thisWeekRemaining * 100) / 100,
    },
    markets: {
      fg: fgNow,
      fgPrev,
      btcBasisPct: mctx.basisBtc?.basisPct ?? null,
      vix: mctx.vix?.level ?? null,
    },
  };

  return { text: formatDigest(digest, now), context: digest };
}

export function formatDigest(ctx: WeeklyDigest["context"], now: Date): string {
  const dateLabel = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Madrid",
  }).format(now);

  const lines: string[] = [];
  lines.push(`📊 Resumen semanal FinTrack · ${dateLabel}`);
  lines.push("─────────────────────────────");

  // Net worth
  const deltaEur = ctx.netWorthDeltaEur;
  const deltaPct = ctx.netWorthDeltaPct;
  const netLine =
    deltaPct !== null
      ? `Net worth: ${eurFmt(ctx.netWorthEur)} (${arrow(deltaEur)} ${eurFmt(deltaEur)}, ${pctFmt(deltaPct)} vs 7d)`
      : `Net worth: ${eurFmt(ctx.netWorthEur)} (snapshot 7d no disponible aún)`;
  lines.push(netLine);
  lines.push("");

  // Allocation
  lines.push("📦 Allocation (drift vs target)");
  for (const cls of ASSET_CLASSES) {
    const a = ctx.allocation[cls];
    if (!a) continue;
    const mark = driftMark(Math.abs(a.driftPp));
    const label = CLASS_LABEL[cls].padEnd(7, " ");
    lines.push(`${label} ${a.actualPct.toFixed(0).padStart(3, " ")}% (${ppFmt(a.driftPp)})${mark}`);
  }
  lines.push("");

  // Multipliers
  const m = ctx.multipliers;
  const mparts: string[] = [`F&G ${ctx.markets.fg}`];
  if (ctx.markets.btcBasisPct !== null) {
    mparts.push(`BTC basis ${ctx.markets.btcBasisPct.toFixed(2)}%`);
  }
  if (ctx.markets.vix !== null) mparts.push(`VIX ${ctx.markets.vix.toFixed(1)}`);
  lines.push("📈 Multipliers activos");
  lines.push(mparts.join(" · "));
  lines.push(
    `→ Crypto ${m.crypto.toFixed(2)}x · ETFs ${m.etfs.toFixed(2)}x · Gold ${m.gold.toFixed(2)}x`,
  );
  lines.push("");

  // Signals
  const sbs = ctx.signalsBySeverity;
  const total = sbs.low + sbs.med + sbs.high + sbs.critical;
  lines.push("🔔 Intel esta semana");
  lines.push(
    `Total ${total} · ${SEVERITY_EMOJI.critical}${sbs.critical} · ${SEVERITY_EMOJI.high}${sbs.high} · ${SEVERITY_EMOJI.med}${sbs.med} · ${SEVERITY_EMOJI.low}${sbs.low}`,
  );
  if (ctx.topUnread.length > 0) {
    lines.push("Unread top 3:");
    ctx.topUnread.forEach((s, i) => {
      lines.push(`${i + 1}. [${s.severity}] ${s.title} (/intel/${s.id})`);
    });
  } else {
    lines.push("Sin pendientes por leer.");
  }
  lines.push("");

  // DCA
  lines.push("💸 DCA esta semana");
  lines.push(
    `Ejecutado ${eurFmt(ctx.dca.thisWeekExecuted)} / ${eurFmt(ctx.dca.weeklyBudget)} (quedan ${eurFmt(ctx.dca.thisWeekRemaining)})`,
  );

  return lines.join("\n");
}
