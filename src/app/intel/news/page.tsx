import Link from "next/link";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { Newspaper } from "lucide-react";
import { db, schema } from "@/lib/db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<number, string> = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
const TIER_STYLE: Record<number, string> = {
  1: "bg-success-soft text-success border-success/30",
  2: "bg-info-soft text-info border-info/30",
  3: "bg-elevated text-muted-foreground border-border",
};
const SOURCE_TIER: Record<string, number> = {
  ecb: 1, fed: 1, bloomberg: 1, ft: 1,
  coindesk: 2, theblock: 2,
  cointelegraph: 3, decrypt: 3,
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-danger-soft text-danger border-danger/30",
  high: "bg-warn-soft text-warn border-warn/30",
  med: "bg-info-soft text-info border-info/30",
  low: "bg-elevated text-muted-foreground border-border",
};

interface SearchParams {
  source?: string;
  score_min?: string;
  only_with_signal?: string;
  days?: string;
  asset?: string;
}

export default async function IntelNewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sources = params.source?.split(",").filter(Boolean);
  const scoreMin = params.score_min ? Number(params.score_min) : null;
  const onlyWithSignal = params.only_with_signal === "true";
  const days = Math.min(90, Math.max(1, Number(params.days || 7)));
  const asset = params.asset?.toUpperCase();

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const conditions = [gte(schema.intelNewsItems.publishedAt, cutoff)];
  if (sources && sources.length > 0) conditions.push(inArray(schema.intelNewsItems.source, sources));
  if (scoreMin != null && Number.isFinite(scoreMin)) conditions.push(gte(schema.intelNewsItems.rawScore, scoreMin));
  if (onlyWithSignal) conditions.push(isNotNull(schema.intelNewsItems.signalId));

  const whereExpr = and(...conditions);

  const rowsRaw = await db
    .select({
      id: schema.intelNewsItems.id,
      source: schema.intelNewsItems.source,
      url: schema.intelNewsItems.url,
      title: schema.intelNewsItems.title,
      publishedAt: schema.intelNewsItems.publishedAt,
      rawScore: schema.intelNewsItems.rawScore,
      assetsMentioned: schema.intelNewsItems.assetsMentioned,
      signalId: schema.intelNewsItems.signalId,
      signalSeverity: schema.intelSignals.severity,
    })
    .from(schema.intelNewsItems)
    .leftJoin(schema.intelSignals, eq(schema.intelNewsItems.signalId, schema.intelSignals.id))
    .where(whereExpr)
    .orderBy(desc(schema.intelNewsItems.publishedAt))
    .limit(200);

  const rows = rowsRaw
    .map((r) => ({ ...r, assets: parseAssets(r.assetsMentioned) }))
    .filter((r) => (asset ? r.assets.includes(asset) : true));

  const [{ totalAll }] = await db
    .select({ totalAll: sql<number>`count(*)` })
    .from(schema.intelNewsItems)
    .where(whereExpr);

  const distinctSources = [...new Set(rowsRaw.map((r) => r.source))].sort();

  return (
    <div className="px-4 md:px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/intel" className="text-muted-foreground hover:text-foreground">← Intel</Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Noticias</span>
      </div>

      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Noticias procesadas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RSS tier 1–3 · últimos {days} días · <span className="tabular-nums">{rows.length}</span> de <span className="tabular-nums">{Number(totalAll)}</span> items
          </p>
        </div>
      </header>

      <Filters
        currentSources={sources ?? []}
        availableSources={distinctSources}
        scoreMin={scoreMin}
        onlyWithSignal={onlyWithSignal}
        days={days}
        asset={asset ?? ""}
      />

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Newspaper className="w-5 h-5" />}
            title="Sin noticias con esos filtros"
            description="Relaja el score mínimo, amplía la ventana de días o prueba otra fuente."
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => {
            const tier = SOURCE_TIER[r.source] ?? 3;
            const faviconUrl = getFaviconUrl(r.url);
            return (
              <article
                key={r.id}
                className="group rounded-xl border border-border bg-card hover:border-border-strong transition-colors p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase font-semibold px-2 py-0.5 rounded border tabular-nums ${TIER_STYLE[tier]}`}>
                    {TIER_LABEL[tier]}
                  </span>
                  {r.signalId && r.signalSeverity && (
                    <Link
                      href={`/intel/${r.signalId}`}
                      className={`inline-flex items-center text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${SEVERITY_BADGE[r.signalSeverity]} hover:opacity-80 transition-opacity`}
                    >
                      signal · {r.signalSeverity}
                    </Link>
                  )}
                  <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">{relativeTime(r.publishedAt)}</span>
                </div>

                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 group-hover:underline"
                >
                  <h2 className="font-display text-lg md:text-xl leading-snug text-foreground">
                    {r.title}
                  </h2>
                </a>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    {faviconUrl && (
                      <span
                        className="w-4 h-4 rounded shrink-0 bg-no-repeat bg-center bg-contain bg-elevated"
                        style={{ backgroundImage: `url(${faviconUrl})` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{r.source}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.rawScore != null && (
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">score {Math.round(r.rawScore)}</span>
                    )}
                  </div>
                </div>

                {r.assets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.assets.slice(0, 4).map((a) => (
                      <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-info-soft text-info font-medium">
                        {a}
                      </span>
                    ))}
                    {r.assets.length > 4 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-muted-foreground">
                        +{r.assets.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getFaviconUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return null;
  }
}

function parseAssets(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function Filters({
  currentSources,
  availableSources,
  scoreMin,
  onlyWithSignal,
  days,
  asset,
}: {
  currentSources: string[];
  availableSources: string[];
  scoreMin: number | null;
  onlyWithSignal: boolean;
  days: number;
  asset: string;
}) {
  return (
    <form className="flex items-end gap-3 flex-wrap border border-border rounded-xl p-3 bg-card">
      <div className="flex flex-col gap-1">
        <label htmlFor="news-f-days" className="text-[10px] uppercase text-muted-foreground tracking-wide">Días</label>
        <select id="news-f-days" name="days" defaultValue={days} className="bg-elevated border border-border rounded px-2 py-1 text-sm">
          <option value={1}>1</option>
          <option value={3}>3</option>
          <option value={7}>7</option>
          <option value={14}>14</option>
          <option value={30}>30</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="news-f-score" className="text-[10px] uppercase text-muted-foreground tracking-wide">Score mín.</label>
        <input
          id="news-f-score" type="number" name="score_min" defaultValue={scoreMin ?? ""}
          min={0} max={100} step={5} placeholder="0"
          className="bg-elevated border border-border rounded px-2 py-1 text-sm w-20 tabular-nums"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="news-f-asset" className="text-[10px] uppercase text-muted-foreground tracking-wide">Asset</label>
        <input
          id="news-f-asset" type="text" name="asset" defaultValue={asset} placeholder="BTC, ETH..."
          className="bg-elevated border border-border rounded px-2 py-1 text-sm w-24 uppercase"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="news-f-source" className="text-[10px] uppercase text-muted-foreground tracking-wide">Fuente</label>
        <select id="news-f-source" name="source" defaultValue={currentSources[0] ?? ""} className="bg-elevated border border-border rounded px-2 py-1 text-sm">
          <option value="">todas</option>
          {availableSources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1 cursor-pointer">
        <input type="checkbox" name="only_with_signal" value="true" defaultChecked={onlyWithSignal} className="accent-info" />
        Solo con signal
      </label>
      <button type="submit" className="px-3 py-1.5 rounded bg-info-soft text-info text-sm font-medium hover:opacity-90 transition-opacity">
        Aplicar
      </button>
      <Link href="/intel/news" className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:text-foreground">
        Limpiar
      </Link>
    </form>
  );
}
