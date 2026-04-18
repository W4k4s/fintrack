import Link from "next/link";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const TIER_ICON: Record<number, string> = { 1: "🏛️", 2: "📰", 3: "📡" };
const SOURCE_TIER: Record<string, number> = {
  ecb: 1,
  fed: 1,
  bloomberg: 1,
  ft: 1,
  coindesk: 2,
  theblock: 2,
  cointelegraph: 3,
  decrypt: 3,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  med: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
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
  if (sources && sources.length > 0) {
    conditions.push(inArray(schema.intelNewsItems.source, sources));
  }
  if (scoreMin != null && Number.isFinite(scoreMin)) {
    conditions.push(gte(schema.intelNewsItems.rawScore, scoreMin));
  }
  if (onlyWithSignal) {
    conditions.push(isNotNull(schema.intelNewsItems.signalId));
  }

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
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/intel" className="text-muted-foreground hover:text-foreground">
          ← Intel
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Noticias</span>
      </div>

      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Noticias procesadas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RSS tier 1–3 • últimos {days} días • {rows.length} de {Number(totalAll)} items
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
        <div className="border border-dashed border-border rounded-xl p-12 text-center mt-6">
          <div className="text-sm text-muted-foreground">
            Sin noticias que cumplan los filtros.
          </div>
        </div>
      ) : (
        <div className="mt-4 border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--hover-bg)] text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
                <th className="text-left px-3 py-2 font-medium">Fuente</th>
                <th className="text-left px-3 py-2 font-medium">Título</th>
                <th className="text-left px-3 py-2 font-medium">Assets</th>
                <th className="text-right px-3 py-2 font-medium">Score</th>
                <th className="text-right px-3 py-2 font-medium">Publicada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const tier = SOURCE_TIER[r.source] ?? 3;
                return (
                  <tr key={r.id} className="hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="px-3 py-2 align-top">
                      {r.signalId ? (
                        <Link
                          href={`/intel/${r.signalId}`}
                          className={`inline-block text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                            SEVERITY_COLORS[r.signalSeverity ?? "low"]
                          }`}
                        >
                          {r.signalSeverity ?? "signal"}
                        </Link>
                      ) : (
                        <span className="text-[10px] uppercase text-muted-foreground">
                          descartada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <span>{TIER_ICON[tier] ?? "•"}</span>{" "}
                      <span className="font-mono text-xs">{r.source}</span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {r.title}
                      </a>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {r.assets.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        r.assets.slice(0, 3).map((a) => (
                          <span
                            key={a}
                            className="inline-block text-[10px] mr-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent"
                          >
                            {a}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right font-mono text-xs">
                      {r.rawScore != null ? Math.round(r.rawScore) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(r.publishedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
        <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Días</label>
        <select
          name="days"
          defaultValue={days}
          className="bg-[var(--hover-bg)] border border-border rounded px-2 py-1 text-sm"
        >
          <option value={1}>1</option>
          <option value={3}>3</option>
          <option value={7}>7</option>
          <option value={14}>14</option>
          <option value={30}>30</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase text-muted-foreground tracking-wide">
          Score mín.
        </label>
        <input
          type="number"
          name="score_min"
          defaultValue={scoreMin ?? ""}
          min={0}
          max={100}
          step={5}
          placeholder="0"
          className="bg-[var(--hover-bg)] border border-border rounded px-2 py-1 text-sm w-20"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Asset</label>
        <input
          type="text"
          name="asset"
          defaultValue={asset}
          placeholder="BTC, ETH..."
          className="bg-[var(--hover-bg)] border border-border rounded px-2 py-1 text-sm w-24 uppercase"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase text-muted-foreground tracking-wide">
          Fuente
        </label>
        <select
          name="source"
          defaultValue={currentSources[0] ?? ""}
          className="bg-[var(--hover-bg)] border border-border rounded px-2 py-1 text-sm"
        >
          <option value="">todas</option>
          {availableSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1 cursor-pointer">
        <input
          type="checkbox"
          name="only_with_signal"
          value="true"
          defaultChecked={onlyWithSignal}
          className="accent-accent"
        />
        Solo con signal
      </label>

      <button
        type="submit"
        className="px-3 py-1.5 rounded bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
      >
        Aplicar
      </button>
      <Link
        href="/intel/news"
        className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:text-foreground"
      >
        Limpiar
      </Link>
    </form>
  );
}
