import Link from "next/link";
import { db, schema } from "@/lib/db";
import { desc, inArray } from "drizzle-orm";
import { NewResearchForm } from "./new-form";

export const dynamic = "force-dynamic";

type StatusKey =
  | "active" | "researching" | "researched" | "shortlisted"
  | "watching" | "open_position" | "closed" | "archived" | "failed" | "all";

const STATUS_TABS: { key: StatusKey; label: string; hint: string; filter: string[] | null }[] = [
  { key: "active", label: "Activos", hint: "En curso + dosiers listos", filter: ["researching", "researched", "shortlisted", "watching", "open_position"] },
  { key: "researching", label: "Investigando", hint: "Worker Claude corriendo", filter: ["researching"] },
  { key: "researched", label: "Dossier listo", hint: "Pendiente decisión", filter: ["researched"] },
  { key: "shortlisted", label: "Shortlisted", hint: "Promovidos a seguimiento", filter: ["shortlisted"] },
  { key: "watching", label: "Watching", hint: "Tesis activa, sin posición", filter: ["watching"] },
  { key: "open_position", label: "Posición", hint: "Abierta con tesis", filter: ["open_position"] },
  { key: "closed", label: "Cerradas", hint: "Tesis cerradas", filter: ["closed"] },
  { key: "archived", label: "Archivadas", hint: "Descartadas", filter: ["archived"] },
  { key: "failed", label: "Fallos", hint: "Errores en fetch o Claude", filter: ["failed"] },
  { key: "all", label: "Todas", hint: "Cualquier estado", filter: null },
];

const VERDICT_COLORS: Record<string, string> = {
  candidate: "bg-green-500/15 text-green-400 border-green-500/30",
  wait: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  pass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const STATUS_DOT: Record<string, string> = {
  researching: "bg-blue-400 animate-pulse",
  researched: "bg-accent",
  shortlisted: "bg-purple-400",
  watching: "bg-cyan-400",
  open_position: "bg-green-400",
  closed: "bg-zinc-500",
  archived: "bg-zinc-600",
  failed: "bg-red-400",
};

function parseTab(v: string | undefined): StatusKey {
  if (!v) return "active";
  return STATUS_TABS.some((t) => t.key === v) ? (v as StatusKey) : "active";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default async function ResearchListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  const all = await db
    .select()
    .from(schema.intelAssetsTracked)
    .orderBy(desc(schema.intelAssetsTracked.updatedAt))
    .limit(300);

  const counts: Record<StatusKey, number> = {
    active: 0, researching: 0, researched: 0, shortlisted: 0,
    watching: 0, open_position: 0, closed: 0, archived: 0, failed: 0,
    all: all.length,
  };
  const activeSet = new Set(["researching", "researched", "shortlisted", "watching", "open_position"]);
  for (const r of all) {
    if (activeSet.has(r.status)) counts.active++;
    if (r.status in counts) counts[r.status as StatusKey]++;
  }

  const activeTab = STATUS_TABS.find((t) => t.key === tab)!;
  const items = activeTab.filter
    ? all.filter((r) => activeTab.filter!.includes(r.status))
    : all;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <header className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Research</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Estudia cualquier activo — recibes dossier Claude con verdict y reglas sugeridas.
            </p>
          </div>
          <Link
            href="/intel"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ← Volver a Intel
          </Link>
        </div>
      </header>

      <NewResearchForm />

      <nav className="mt-6 mb-4 flex flex-wrap gap-1.5 border-b border-border">
        {STATUS_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "active" ? "/intel/research" : `/intel/research?tab=${t.key}`}
              title={t.hint}
              className={`inline-flex items-center gap-2 px-3 py-2 -mb-px border-b-2 text-sm transition-colors ${
                active
                  ? "border-accent text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`inline-flex items-center justify-center min-w-[20px] px-1.5 h-5 rounded-full text-[10px] font-mono ${
                  active ? "bg-accent/15 text-accent" : "bg-elevated text-muted-foreground"
                }`}
              >
                {counts[t.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-2">🔬</div>
          <div className="text-sm text-muted-foreground">
            Sin research en &quot;{activeTab.label}&quot;. Añade uno con el form de arriba.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <Link
              key={r.id}
              href={`/intel/research/${r.id}`}
              className="block rounded-xl border border-border bg-card hover:bg-[var(--hover-bg)] transition-colors p-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${STATUS_DOT[r.status] ?? "bg-zinc-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.ticker}</span>
                    {r.name && <span className="text-xs text-muted-foreground truncate max-w-md">{r.name}</span>}
                    {r.verdict && (
                      <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${VERDICT_COLORS[r.verdict] ?? ""}`}>
                        {r.verdict}
                      </span>
                    )}
                    {r.subClass && (
                      <span className="text-[10px] uppercase text-muted-foreground">{r.subClass}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{relativeTime(r.updatedAt)}</span>
                  </div>
                  {r.note && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-1">📝 {r.note}</div>
                  )}
                  {r.status === "failed" && r.failureReason && (
                    <div className="mt-1 text-xs text-red-400 line-clamp-1">✗ {r.failureReason}</div>
                  )}
                  {r.status === "researching" && (
                    <div className="mt-1 text-xs text-blue-400">… Claude analizando</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
