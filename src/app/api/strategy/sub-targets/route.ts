import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import Database from "better-sqlite3";
import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { recalcFlatFromSubTargets } from "@/lib/db/seed-sub-targets";

// Strategy V2 Fase 1b — endpoint de sub-targets. Fuente de verdad para la
// allocation por sub-clase. Al escribir, recalcula los 6 flat targets de
// strategy_profiles como suma por parent_class para mantener invariante
// y compatibilidad con los 11 ficheros legacy que leen flat.

const ALL_SUB_CLASSES = [
  "cash_yield", "etf_core", "etf_factor", "bonds_infl", "gold",
  "crypto_core", "crypto_alt", "thematic_plays", "legacy_hold",
] as const;
type SubClass = (typeof ALL_SUB_CLASSES)[number];

const ALL_PARENT_CLASSES = ["cash", "etfs", "crypto", "gold", "bonds", "stocks"] as const;
type ParentClass = (typeof ALL_PARENT_CLASSES)[number];

const PARENT_BY_SUB: Record<SubClass, ParentClass> = {
  cash_yield: "cash",
  etf_core: "etfs",
  etf_factor: "etfs",
  bonds_infl: "bonds",
  gold: "gold",
  crypto_core: "crypto",
  crypto_alt: "crypto",
  legacy_hold: "crypto",
  thematic_plays: "stocks",
};

type SubTargetInput = {
  subClass: SubClass;
  parentClass: ParentClass;
  targetPct: number;
};

function validatePayload(raw: unknown): { profileId: number; subTargets: SubTargetInput[] } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "payload debe ser objeto" };
  const obj = raw as Record<string, unknown>;
  const profileId = Number(obj.profileId);
  if (!Number.isInteger(profileId) || profileId <= 0) return { error: "profileId inválido" };
  if (!Array.isArray(obj.subTargets)) return { error: "subTargets debe ser array" };

  const out: SubTargetInput[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const item of obj.subTargets) {
    if (!item || typeof item !== "object") return { error: "cada subTarget debe ser objeto" };
    const row = item as Record<string, unknown>;
    const sub = String(row.subClass);
    if (!ALL_SUB_CLASSES.includes(sub as SubClass)) return { error: `subClass inválido: ${sub}` };
    if (seen.has(sub)) return { error: `subClass duplicado: ${sub}` };
    seen.add(sub);
    const expectedParent = PARENT_BY_SUB[sub as SubClass];
    const parent = String(row.parentClass);
    if (parent !== expectedParent) return { error: `parentClass de ${sub} debe ser ${expectedParent}, recibido ${parent}` };
    const pct = Number(row.targetPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: `targetPct fuera de rango en ${sub}` };
    out.push({ subClass: sub as SubClass, parentClass: expectedParent, targetPct: Math.round(pct * 100) / 100 });
    total += pct;
  }
  if (Math.abs(total - 100) > 0.01) return { error: `suma de targetPct = ${total.toFixed(2)}, debe ser 100 ±0.01` };
  return { profileId, subTargets: out };
}

export async function GET() {
  const [profile] = await db
    .select()
    .from(schema.strategyProfiles)
    .where(eq(schema.strategyProfiles.active, true))
    .limit(1);
  if (!profile) return NextResponse.json({ error: "no active profile" }, { status: 404 });

  const rows = await db
    .select()
    .from(schema.strategySubTargets)
    .where(eq(schema.strategySubTargets.profileId, profile.id))
    .orderBy(asc(schema.strategySubTargets.parentClass), asc(schema.strategySubTargets.subClass));

  return NextResponse.json({
    profileId: profile.id,
    subTargets: rows.map((r) => ({
      subClass: r.subClass,
      parentClass: r.parentClass,
      targetPct: r.targetPct,
      notes: r.notes,
    })),
  });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const validated = validatePayload(body);
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

  const { profileId, subTargets } = validated;

  const sqlite = new Database("./data/fintrack.db");
  try {
    const tx = sqlite.transaction(() => {
      sqlite.prepare(`DELETE FROM strategy_sub_targets WHERE profile_id = ?`).run(profileId);
      const insertStmt = sqlite.prepare(
        `INSERT INTO strategy_sub_targets (profile_id, sub_class, parent_class, target_pct)
         VALUES (?, ?, ?, ?)`,
      );
      for (const row of subTargets) {
        insertStmt.run(profileId, row.subClass, row.parentClass, row.targetPct);
      }
      return recalcFlatFromSubTargets(sqlite, profileId);
    });
    const flat = tx();
    revalidateTag("strategy", "default");
    return NextResponse.json({ ok: true, profileId, subTargets, flat });
  } finally {
    sqlite.close();
  }
}
