import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SignalActions } from "./actions";
import { AnalysisRenderer, parseHeadlineShort } from "./analysis";
import { RebalancePlanCard } from "@/components/intel/rebalance-plan-card";
import { computeAllocation } from "@/lib/intel/allocation/compute";
import type { RebalancePlan } from "@/lib/intel/rebalance/types";
import { ASSET_CLASSES, type AssetClass } from "@/lib/intel/allocation/classify";

export const dynamic = "force-dynamic";

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [row] = await db
    .select()
    .from(schema.intelSignals)
    .where(eq(schema.intelSignals.id, id))
    .limit(1);
  if (!row) notFound();

  const notifications = await db
    .select()
    .from(schema.intelNotifications)
    .where(eq(schema.intelNotifications.signalId, id));

  const payload = safeParse(row.payload);
  const headlineShort = parseHeadlineShort(row.analysisText);
  const plan = extractPlan(payload);
  const staleInfo = plan ? await computeStaleness(plan) : null;

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto">
      <Link href="/intel" className="text-sm text-muted-foreground hover:text-foreground">
        ← Volver a Intel
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">{row.scope}</span>
          {row.asset && <><span>•</span><span>{row.asset}</span></>}
          <span>•</span>
          <span className="uppercase">{row.severity}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold">
          {headlineShort ?? row.title}
        </h1>
        {headlineShort && (
          <div className="text-xs text-muted-foreground mt-1 font-mono">
            {row.title}
          </div>
        )}
        <p className="mt-2 text-muted-foreground">{row.summary}</p>
      </header>

      <div className="mb-6">
        {row.analysisStatus === "claude_done" && row.analysisText ? (
          <AnalysisRenderer analysisText={row.analysisText} />
        ) : row.analysisStatus === "claude_requested" ? (
          <div className="border border-border rounded-xl p-4 bg-card">
            <div className="text-sm text-muted-foreground italic animate-pulse">
              Claude está analizando la señal… recarga en unos segundos.
            </div>
          </div>
        ) : row.analysisStatus === "claude_failed" ? (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4">
            <div className="text-sm text-red-400">
              El análisis falló. Puedes re-intentar con el botón Re-analizar o revisar logs.
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-xl p-4 bg-card">
            <div className="text-sm text-muted-foreground">
              {row.analysisStatus === "pending_manual"
                ? "Sin análisis automático (hubo fallos recientes, circuit breaker abierto 30 min)."
                : "Sin análisis automático (severity baja — no merece llamar a Claude)."}
            </div>
          </div>
        )}
      </div>

      {plan && <RebalancePlanCard plan={plan} stale={staleInfo} />}

      {row.scope === "news" && (
        <NewsSource payload={payload} />
      )}

      <section className="border border-border rounded-xl p-4 bg-card mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Datos crudos detectados
        </div>
        <pre className="text-xs overflow-auto bg-[var(--hover-bg)] p-3 rounded max-h-64">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </section>

      <section className="border border-border rounded-xl p-4 bg-card mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Notificaciones
        </div>
        {notifications.length === 0 ? (
          <div className="text-sm text-muted-foreground">Ninguna todavía.</div>
        ) : (
          <ul className="text-xs space-y-1">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <span className="font-mono">{n.channel}</span>
                <span className={n.status === "sent" ? "text-green-400" : "text-muted-foreground"}>
                  {n.status}
                </span>
                {n.suppressionReason && (
                  <span className="text-muted-foreground">({n.suppressionReason})</span>
                )}
                <span className="text-muted-foreground ml-auto">
                  {n.sentAt ? new Date(n.sentAt).toLocaleTimeString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SignalActions id={id} currentStatus={row.userStatus} />
    </div>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function extractPlan(payload: unknown): RebalancePlan | null {
  if (!payload || typeof payload !== "object") return null;
  const p = (payload as { plan?: unknown }).plan;
  if (!p || typeof p !== "object") return null;
  const plan = p as RebalancePlan;
  if (!plan.moves || !plan.fiscal || !plan.targets) return null;
  return plan;
}

async function computeStaleness(plan: RebalancePlan) {
  try {
    const alloc = await computeAllocation();
    if (alloc.netWorth <= 0) return null;
    const driftNow: Record<string, number> = {};
    let maxDelta = 0;
    for (const cls of ASSET_CLASSES) {
      const snap = plan.targets[cls as AssetClass];
      if (!snap) continue;
      const currentActual = alloc.byClass[cls]?.pct ?? 0;
      const currentDrift = currentActual - snap.targetPct;
      driftNow[cls] = Math.round(currentDrift * 100) / 100;
      const delta = Math.abs(currentDrift - snap.driftPp);
      if (delta > maxDelta) maxDelta = delta;
    }
    return { driftNow, maxDeltaPp: Math.round(maxDelta * 100) / 100 };
  } catch {
    return null;
  }
}

function NewsSource({ payload }: { payload: unknown }) {
  const p = (payload ?? {}) as Record<string, unknown>;
  const source = String(p.source ?? "");
  const tier = Number(p.publisherTier ?? 0);
  const url = typeof p.url === "string" ? p.url : "";
  const pub = typeof p.publishedAt === "string" ? p.publishedAt : "";
  const title = typeof p.title === "string" ? p.title : "";
  const keywords = Array.isArray(p.keywordsMatched) ? (p.keywordsMatched as string[]) : [];
  const score = Number(p.rawScore ?? 0);
  if (!source && !url) return null;
  const tierLabel = tier === 1 ? "tier 1" : tier === 2 ? "tier 2" : tier === 3 ? "tier 3" : "";
  return (
    <section className="border border-border rounded-xl p-4 bg-card mb-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
        Noticia original
      </div>
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="font-mono">{source}</span>
        {tierLabel && <span>• {tierLabel}</span>}
        {pub && <span>• {new Date(pub).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</span>}
        {Number.isFinite(score) && score > 0 && <span>• score {score}</span>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline ml-auto"
          >
            Abrir fuente ↗
          </a>
        )}
      </div>
      {keywords.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {keywords.slice(0, 6).map((k) => (
            <span
              key={k}
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--hover-bg)] text-muted-foreground"
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
