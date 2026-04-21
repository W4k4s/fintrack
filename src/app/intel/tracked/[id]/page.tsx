import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ThesisForm } from "./ThesisForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  watching: "Watching",
  open_position: "Posición abierta",
  closed: "Cerrada",
};

const STATUS_COLORS: Record<string, string> = {
  watching: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  open_position: "bg-green-500/15 text-green-400 border-green-500/30",
  closed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export default async function TrackedAssetPage({
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

  const editable = row.status === "watching" || row.status === "open_position";

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/intel" className="hover:text-foreground">← Intel</Link>
        <span>/</span>
        <Link href={`/intel/research/${id}`} className="hover:text-foreground">
          Research #{id}
        </Link>
        <span>/</span>
        <span className="text-foreground">Tesis</span>
      </nav>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{row.ticker}</h1>
          <span
            className={`px-2 py-0.5 text-xs rounded-md border ${STATUS_COLORS[row.status] ?? "border-zinc-500/30 text-zinc-400"}`}
          >
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
          {row.subClass && (
            <span className="text-xs text-muted-foreground">sub-clase {row.subClass}</span>
          )}
        </div>
        {row.name && <p className="text-sm text-muted-foreground">{row.name}</p>}
      </header>

      {!editable && (
        <section className="rounded-lg border border-zinc-500/30 bg-zinc-500/5 p-4 text-sm">
          La tesis no es editable en status <strong>{row.status}</strong>.{" "}
          <Link href={`/intel/research/${id}`} className="underline">
            Volver al dossier
          </Link>
          .
        </section>
      )}

      {editable && (
        <ThesisForm
          id={row.id}
          status={row.status as "watching" | "open_position"}
          initial={{
            thesis: row.thesis ?? "",
            entryPlan: row.entryPlan ?? "",
            entryPrice: row.entryPrice ?? null,
            entryDate: row.entryDate ?? null,
            targetPrice: row.targetPrice ?? null,
            stopPrice: row.stopPrice ?? null,
            timeHorizonMonths: row.timeHorizonMonths ?? null,
          }}
        />
      )}

      {row.status === "closed" && (
        <section className="rounded-lg border border-zinc-500/30 p-4 text-sm space-y-1">
          <div>
            <strong>Cerrada:</strong> {row.closedAt ?? "-"}
          </div>
          <div>
            <strong>Motivo:</strong> {row.closedReason ?? "-"}
          </div>
        </section>
      )}
    </main>
  );
}
