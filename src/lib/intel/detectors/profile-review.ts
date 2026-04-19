import { db, schema } from "@/lib/db";
import { and, eq, gte } from "drizzle-orm";
import { ASSET_CLASSES, type AssetClass } from "../allocation/classify";
import { weekWindowKey } from "../dedup";
import { createHash } from "crypto";
import type { Detector, DetectorContext, DetectorSignal } from "../types";
import type { SnapshotClass } from "../allocation/snapshot";

/** |drift|pp por encima del cual una clase se considera "fuera de target". */
const DRIFT_THRESHOLD_PP = 10;
/** Muestras mínimas por trimestre para considerar la evidencia suficiente. */
const MIN_SAMPLES_PER_QUARTER = 10;
/** Ventana observada: 2 trimestres = 180 días. */
const WINDOW_DAYS = 180;
/** Duración de un trimestre (split ~90d). */
const QUARTER_DAYS = 90;

const CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etfs: "ETFs",
  gold: "Gold",
  bonds: "Bonds",
  stocks: "Stocks",
};

interface QuarterSummary {
  samples: number;
  median: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function quarterKey(now: Date): string {
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

export interface ProfileReviewHit {
  class: AssetClass;
  quarter0: QuarterSummary; // más antiguo (90-180d)
  quarter1: QuarterSummary; // más reciente (0-90d)
  direction: "over" | "under";
  medianDriftPp: number;
}

export async function analyzeProfileDrift(
  now: Date,
): Promise<ProfileReviewHit[]> {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const snapshots = await db
    .select()
    .from(schema.intelAllocationSnapshots)
    .where(gte(schema.intelAllocationSnapshots.date, cutoffIso))
    .orderBy(schema.intelAllocationSnapshots.date);

  if (snapshots.length < MIN_SAMPLES_PER_QUARTER * 2) return [];

  const splitDate = new Date(now.getTime() - QUARTER_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const byClassByQuarter: Record<AssetClass, { q0: number[]; q1: number[] }> = {
    cash: { q0: [], q1: [] },
    crypto: { q0: [], q1: [] },
    etfs: { q0: [], q1: [] },
    gold: { q0: [], q1: [] },
    bonds: { q0: [], q1: [] },
    stocks: { q0: [], q1: [] },
  };

  for (const snap of snapshots) {
    let parsed: Record<string, SnapshotClass>;
    try {
      parsed = JSON.parse(snap.allocation) as Record<string, SnapshotClass>;
    } catch {
      continue;
    }
    const bucket = snap.date < splitDate ? "q0" : "q1";
    for (const cls of ASSET_CLASSES) {
      const v = parsed[cls];
      if (!v || !Number.isFinite(v.driftPp)) continue;
      byClassByQuarter[cls][bucket].push(v.driftPp);
    }
  }

  const hits: ProfileReviewHit[] = [];
  for (const cls of ASSET_CLASSES) {
    const q0 = byClassByQuarter[cls].q0;
    const q1 = byClassByQuarter[cls].q1;
    if (q0.length < MIN_SAMPLES_PER_QUARTER || q1.length < MIN_SAMPLES_PER_QUARTER) continue;

    const m0 = median(q0.map((x) => Math.abs(x)));
    const m1 = median(q1.map((x) => Math.abs(x)));
    if (m0 < DRIFT_THRESHOLD_PP || m1 < DRIFT_THRESHOLD_PP) continue;

    // Misma dirección en ambos trimestres (la desalineación es persistente, no un rebote).
    const sign0 = Math.sign(median(q0));
    const sign1 = Math.sign(median(q1));
    if (sign0 === 0 || sign1 === 0 || sign0 !== sign1) continue;

    hits.push({
      class: cls,
      quarter0: { samples: q0.length, median: Math.round(m0 * 10) / 10 },
      quarter1: { samples: q1.length, median: Math.round(m1 * 10) / 10 },
      direction: sign1 > 0 ? "over" : "under",
      medianDriftPp: Math.round(((m0 + m1) / 2) * 10) / 10,
    });
  }

  return hits;
}

function hitsSeverity(hits: ProfileReviewHit[]): "med" | "high" | "critical" {
  const max = Math.max(...hits.map((h) => h.medianDriftPp));
  if (max >= 20) return "critical";
  if (max >= 15) return "high";
  return "med";
}

export const profileReviewDetector: Detector = {
  scope: "profile_review",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const [profile] = await db
      .select()
      .from(schema.strategyProfiles)
      .where(eq(schema.strategyProfiles.active, true))
      .limit(1);
    if (!profile) return [];

    const hits = await analyzeProfileDrift(ctx.now);
    if (hits.length === 0) return [];

    const qKey = quarterKey(ctx.now);
    const keyRaw = `profile_review:${profile.id}:${qKey}:${hits.map((h) => `${h.class}-${h.direction}`).sort().join(",")}`;
    const dedup = createHash("sha1").update(keyRaw).digest("hex").slice(0, 20);

    const severity = hitsSeverity(hits);
    const summary = hits
      .map(
        (h) =>
          `${CLASS_LABEL[h.class]} ${h.direction === "over" ? "≥" : "≤"}${h.medianDriftPp.toFixed(1)}pp (${h.quarter0.samples}+${h.quarter1.samples} muestras)`,
      )
      .join(", ");
    const classesTxt = hits.map((h) => CLASS_LABEL[h.class]).join(", ");

    return [
      {
        dedupKey: dedup,
        scope: "profile_review",
        asset: null,
        assetClass: null,
        severity,
        title: `Revisar perfil: ${classesTxt} desalineado ≥2 trimestres`,
        summary: `Desalineación persistente: ${summary}. Considera revisar los targets del perfil, no rebalancear.`,
        payload: {
          profileId: profile.id,
          windowDays: WINDOW_DAYS,
          threshold: DRIFT_THRESHOLD_PP,
          quarter: qKey,
          hits,
          targetsSnapshot: {
            cash: profile.targetCash,
            crypto: profile.targetCrypto,
            etfs: profile.targetEtfs,
            gold: profile.targetGold,
            bonds: profile.targetBonds,
            stocks: profile.targetStocks,
          },
        },
        suggestedAction: "review",
        actionAmountEur: null,
      },
    ];
  },
};

export const __internal = { median, quarterKey };
