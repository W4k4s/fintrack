import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ResearchActions } from "./actions";

export const dynamic = "force-dynamic";

const VERDICT_COLORS: Record<string, string> = {
  candidate: "bg-green-500/15 text-green-400 border-green-500/30",
  wait: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  pass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  researching: "Investigando…",
  researched: "Dossier listo",
  shortlisted: "Shortlisted",
  watching: "Watching",
  open_position: "Posición abierta",
  closed: "Cerrada",
  archived: "Archivada",
  failed: "Fallo",
};

const DISQUAL_STATUS_COLORS: Record<string, string> = {
  pass: "text-green-400",
  fail: "text-red-400",
  unknown: "text-yellow-400",
};

function safeParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

interface Dossier {
  ticker?: string;
  asset_class?: string;
  sub_class_proposed?: string;
  disqualifiers_checked_detail?: Array<{ id: string; status: string; evidence: string }>;
  checklist_failed?: string[];
  verdict?: string;
  verdict_reason_short?: string;
  what_is_it?: string;
  base_rate_note?: string;
  pros?: string[];
  cons?: string[];
  red_flags?: string[];
  correlation_notes?: string;
  technical_state_now?: string;
  upcoming_catalysts?: Array<{ event: string; date_estimate: string }>;
  mini_backtest?: { period_years: number; trades_simulated: number; hit_rate: number; expectancy_R: number; max_drawdown_pct: number; note?: string } | null;
  suggested_rules?: {
    entry_plan?: string; target?: string; stop?: string;
    time_horizon?: string; position_size_pct?: number; vol_adjustment_reason?: string;
  } | null;
  confidence?: string;
  confidence_evidence?: string[];
}

export default async function ResearchDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [row] = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(eq(schema.intelAssetsTracked.id, id))
    .limit(1);
  if (!row) notFound();

  const dossier = safeParse<Dossier>(row.dossierJson);
  const verdict = row.verdict ?? dossier?.verdict;

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto">
      <Link
        href="/intel/research"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        ← Volver a research
      </Link>

      <header className="rounded-xl border border-border bg-card p-5 mb-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight font-mono">{row.ticker}</h1>
              {verdict && (
                <span className={`text-xs uppercase font-semibold px-2 py-0.5 rounded border ${VERDICT_COLORS[verdict] ?? ""}`}>
                  {verdict}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[row.status] ?? row.status}</span>
              {row.subClass && (
                <span className="text-xs uppercase text-muted-foreground">· {row.subClass}</span>
              )}
            </div>
            {row.name && <p className="mt-1 text-sm text-muted-foreground">{row.name}</p>}
            {dossier?.verdict_reason_short && (
              <p className="mt-3 text-sm">{dossier.verdict_reason_short}</p>
            )}
          </div>
        </div>
        {row.note && (
          <div className="mt-4 text-xs text-muted-foreground">📝 Nota original: {row.note}</div>
        )}
      </header>

      {row.status === "researching" && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 mb-5 text-sm">
          ⏳ Claude analizando. Suele tardar 1-2 min. Recarga la página en un momento.
        </div>
      )}

      {row.status === "failed" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 mb-5">
          <div className="text-sm font-medium text-red-400">✗ Research falló</div>
          {row.failureReason && (
            <div className="mt-1 text-xs text-red-300 font-mono">{row.failureReason}</div>
          )}
          <div className="mt-3">
            <ResearchActions id={row.id} status={row.status} />
          </div>
        </div>
      )}

      {dossier && (
        <div className="flex flex-col gap-4">
          {dossier.what_is_it && (
            <Section title="Qué es">
              <p className="text-sm">{dossier.what_is_it}</p>
              {dossier.base_rate_note && (
                <p className="mt-2 text-xs text-muted-foreground italic">📊 {dossier.base_rate_note}</p>
              )}
            </Section>
          )}

          {dossier.disqualifiers_checked_detail && dossier.disqualifiers_checked_detail.length > 0 && (
            <Section title="Checklist de guardrails">
              <div className="flex flex-col gap-2">
                {dossier.disqualifiers_checked_detail.map((d) => (
                  <div key={d.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-xs ${DISQUAL_STATUS_COLORS[d.status] ?? ""}`}>
                        {d.status === "pass" ? "✓" : d.status === "fail" ? "✗" : "?"}
                      </span>
                      <span className="font-medium">{d.id}</span>
                      <span className={`text-xs uppercase ${DISQUAL_STATUS_COLORS[d.status] ?? ""}`}>{d.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground ml-5 mt-0.5">{d.evidence}</div>
                  </div>
                ))}
              </div>
              {dossier.checklist_failed && dossier.checklist_failed.length > 0 && (
                <div className="mt-3 text-xs text-red-400">
                  Fallos: {dossier.checklist_failed.join(", ")}
                </div>
              )}
            </Section>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {dossier.pros && dossier.pros.length > 0 && (
              <Section title="Pros">
                <ul className="list-disc list-inside text-sm flex flex-col gap-1">
                  {dossier.pros.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </Section>
            )}
            {dossier.cons && dossier.cons.length > 0 && (
              <Section title="Cons">
                <ul className="list-disc list-inside text-sm flex flex-col gap-1">
                  {dossier.cons.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </Section>
            )}
          </div>

          {dossier.red_flags && dossier.red_flags.length > 0 && (
            <Section title="🚩 Red flags" accent="red">
              <ul className="list-disc list-inside text-sm flex flex-col gap-1 text-red-300">
                {dossier.red_flags.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Section>
          )}

          {dossier.correlation_notes && (
            <Section title="Correlación vs holdings">
              <p className="text-sm font-mono">{dossier.correlation_notes}</p>
            </Section>
          )}

          {dossier.technical_state_now && (
            <Section title="Técnica actual">
              <p className="text-sm">{dossier.technical_state_now}</p>
            </Section>
          )}

          {dossier.upcoming_catalysts && dossier.upcoming_catalysts.length > 0 && (
            <Section title="Próximos catalizadores">
              <ul className="text-sm flex flex-col gap-1">
                {dossier.upcoming_catalysts.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.event}</span>
                    <span className="text-xs text-muted-foreground ml-2">({c.date_estimate})</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {dossier.mini_backtest && (
            <Section title="Mini-backtest del plan">
              <div className="text-sm font-mono grid grid-cols-2 md:grid-cols-5 gap-2">
                <Metric label="Período" value={`${dossier.mini_backtest.period_years}y`} />
                <Metric label="Trades" value={String(dossier.mini_backtest.trades_simulated)} />
                <Metric label="Hit rate" value={`${(dossier.mini_backtest.hit_rate * 100).toFixed(0)}%`} />
                <Metric label="Expectancy" value={`${dossier.mini_backtest.expectancy_R.toFixed(2)}R`} color={dossier.mini_backtest.expectancy_R > 0 ? "green" : "red"} />
                <Metric label="Max DD" value={`${dossier.mini_backtest.max_drawdown_pct.toFixed(0)}%`} color="red" />
              </div>
              {dossier.mini_backtest.note && (
                <p className="mt-2 text-xs text-muted-foreground">{dossier.mini_backtest.note}</p>
              )}
            </Section>
          )}

          {dossier.suggested_rules && (
            <Section title="Reglas sugeridas" accent="green">
              <dl className="grid md:grid-cols-2 gap-3 text-sm">
                {dossier.suggested_rules.entry_plan && <Field label="Entry plan" value={dossier.suggested_rules.entry_plan} />}
                {dossier.suggested_rules.target && <Field label="Target" value={dossier.suggested_rules.target} />}
                {dossier.suggested_rules.stop && <Field label="Stop (SOFT)" value={dossier.suggested_rules.stop} />}
                {dossier.suggested_rules.time_horizon && <Field label="Horizonte" value={dossier.suggested_rules.time_horizon} />}
                {typeof dossier.suggested_rules.position_size_pct === "number" && (
                  <Field label="Position size" value={`${dossier.suggested_rules.position_size_pct.toFixed(1)}%`} />
                )}
              </dl>
              {dossier.suggested_rules.vol_adjustment_reason && (
                <p className="mt-2 text-xs text-muted-foreground">{dossier.suggested_rules.vol_adjustment_reason}</p>
              )}
            </Section>
          )}

          {dossier.confidence && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <span className="text-xs uppercase text-muted-foreground">Confianza Claude:</span>{" "}
              <span className="font-semibold">{dossier.confidence}</span>
              {dossier.confidence_evidence && dossier.confidence_evidence.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground flex flex-col gap-1">
                  {dossier.confidence_evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {row.status !== "researching" && row.status !== "failed" && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <ResearchActions id={row.id} status={row.status} />
        </div>
      )}

      <div className="mt-6 text-xs text-muted-foreground">
        Generado {row.researchedAt ? new Date(row.researchedAt).toLocaleString() : "—"}. Disclaimer: información, no asesoramiento financiero regulado.
      </div>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent?: "red" | "green"; children: React.ReactNode }) {
  const border = accent === "red" ? "border-red-500/30 bg-red-500/5"
    : accent === "green" ? "border-green-500/30 bg-green-500/5"
    : "border-border bg-card";
  return (
    <section className={`rounded-xl border ${border} p-4`}>
      <h2 className="text-xs uppercase font-semibold text-muted-foreground mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const colorClass = color === "green" ? "text-green-400" : color === "red" ? "text-red-400" : "";
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-semibold ${colorClass}`}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
