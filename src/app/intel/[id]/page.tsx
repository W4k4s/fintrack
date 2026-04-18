import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SignalActions } from "./actions";

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
          <span>{row.severity}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold">{row.title}</h1>
        <p className="mt-2 text-muted-foreground">{row.summary}</p>
      </header>

      <section className="border border-border rounded-xl p-4 bg-card mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Análisis
        </div>
        {row.analysisStatus === "claude_done" && row.analysisText ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {row.analysisText}
          </div>
        ) : row.analysisStatus === "claude_requested" ? (
          <div className="text-sm text-muted-foreground italic">
            Claude procesando… (recarga en unos segundos)
          </div>
        ) : row.analysisStatus === "claude_failed" ? (
          <div className="text-sm text-red-400">
            Claude falló al analizar. Revisa logs.
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {row.analysisStatus === "pending_manual"
              ? "Sin análisis automático (circuit breaker abierto)."
              : "Sin análisis (severity bajo)."}
          </div>
        )}
      </section>

      <section className="border border-border rounded-xl p-4 bg-card mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Acción sugerida
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{row.suggestedAction || "—"}</span>
          {row.actionAmountEur != null && (
            <span className="text-muted-foreground">{row.actionAmountEur.toFixed(2)}€</span>
          )}
        </div>
      </section>

      <section className="border border-border rounded-xl p-4 bg-card mb-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Payload
        </div>
        <pre className="text-xs overflow-auto bg-[var(--hover-bg)] p-3 rounded">
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
