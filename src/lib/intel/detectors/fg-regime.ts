import { dedupKey, dayWindowKey } from "../dedup";
import type { Detector, DetectorContext, DetectorSignal } from "../types";

interface FgEntry {
  value: number;
  classification: string;
  timestamp: string;
}

async function fetchFearGreed(): Promise<FgEntry | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data?.data?.[0];
    if (!entry) return null;
    return {
      value: Number(entry.value),
      classification: entry.value_classification,
      timestamp: entry.timestamp,
    };
  } catch {
    return null;
  }
}

export const fgRegimeDetector: Detector = {
  scope: "fg_regime",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const fg = await fetchFearGreed();
    if (!fg) return [];

    const windowKey = dayWindowKey(ctx.now);

    if (fg.value <= 25) {
      return [
        {
          dedupKey: dedupKey("fg_regime", "crypto", windowKey + ":extreme_fear"),
          scope: "fg_regime",
          asset: null,
          assetClass: "crypto",
          severity: fg.value <= 15 ? "critical" : "high",
          title: `F&G ${fg.value} — ${fg.classification}`,
          summary: `Miedo extremo en crypto (F&G=${fg.value}). Ventana histórica de acumulación.`,
          payload: {
            fgValue: fg.value,
            classification: fg.classification,
            timestamp: fg.timestamp,
            threshold: 25,
          },
          suggestedAction: "buy_accelerate",
        },
      ];
    }

    if (fg.value >= 80) {
      return [
        {
          dedupKey: dedupKey("fg_regime", "crypto", windowKey + ":extreme_greed"),
          scope: "fg_regime",
          asset: null,
          assetClass: "crypto",
          severity: "med",
          title: `F&G ${fg.value} — ${fg.classification}`,
          summary: `Avaricia extrema (F&G=${fg.value}). Riesgo de compra en techo local.`,
          payload: {
            fgValue: fg.value,
            classification: fg.classification,
            timestamp: fg.timestamp,
          },
          suggestedAction: "review",
        },
      ];
    }

    return [];
  },
};
