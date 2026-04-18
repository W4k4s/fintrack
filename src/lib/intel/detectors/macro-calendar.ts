import { dedupKey } from "../dedup";
import { MACRO_FEEDS } from "../macro/feeds";
import { fetchMacroFeed } from "../macro/fetcher";
import type { MacroEvent } from "../macro/parser";
import type { Detector, DetectorContext, DetectorSignal, Severity } from "../types";

const WATCH_COUNTRIES = new Set(["USD", "EUR"]);
const WINDOW_MS = 24 * 3600 * 1000;

interface Classification {
  severity: Severity;
  category: "rate_decision" | "inflation" | "jobs" | "growth" | "other";
}

function classifyEvent(event: MacroEvent): Classification {
  const t = event.title.toLowerCase();

  // Rate decisions — mueven todos los mercados
  if (
    t.includes("federal funds rate") ||
    t.includes("fomc statement") ||
    t.includes("main refinancing rate") ||
    t.includes("monetary policy statement") ||
    t.includes("ecb press conference") ||
    t.includes("fomc press conference")
  ) {
    return { severity: "critical", category: "rate_decision" };
  }

  // Inflation prints
  if (t.includes("cpi") || t.includes("core pce") || t.includes("ppi m/m")) {
    return { severity: "high", category: "inflation" };
  }

  // Jobs
  if (
    t.includes("non-farm employment change") ||
    t.includes("nonfarm payroll") ||
    t.includes("unemployment rate")
  ) {
    return { severity: "high", category: "jobs" };
  }

  // Growth / activity
  if (t.includes("gdp") || t.includes("flash manufacturing pmi") || t.includes("retail sales m/m")) {
    return { severity: "med", category: "growth" };
  }

  return { severity: "low", category: "other" };
}

function formatHoursFromNow(eventTime: number, now: number): string {
  const diffH = (eventTime - now) / 3_600_000;
  if (diffH < 1) return `en ${Math.max(0, Math.round(diffH * 60))} min`;
  if (diffH < 24) return `en ${diffH.toFixed(1)}h`;
  return `en ${(diffH / 24).toFixed(1)}d`;
}

function buildSignal(event: MacroEvent, now: Date): DetectorSignal {
  const { severity, category } = classifyEvent(event);
  const eventDate = new Date(event.startUtc);
  const eventKey = `${event.startUtc.slice(0, 10)}:${event.country}:${event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40)}`;

  const whenFromNow = formatHoursFromNow(eventDate.getTime(), now.getTime());
  const forecastTxt = event.forecast ? ` (forecast ${event.forecast}` : "";
  const previousTxt = event.previous
    ? forecastTxt
      ? `, previo ${event.previous})`
      : ` (previo ${event.previous})`
    : forecastTxt
      ? ")"
      : "";

  const title = `${event.country} ${event.title} ${whenFromNow}`;
  const summary = `Evento macro high-impact ${event.country}: ${event.title}${forecastTxt}${previousTxt}. Puede mover precios en ${event.country === "USD" ? "equity US + crypto" : "equity EU + EUR"}.`;

  return {
    dedupKey: dedupKey("macro_event", event.country, eventKey),
    scope: "macro_event",
    asset: null,
    assetClass: "macro",
    severity,
    title,
    summary,
    payload: {
      country: event.country,
      eventTitle: event.title,
      startUtc: event.startUtc,
      impact: event.impact,
      forecast: event.forecast,
      previous: event.previous,
      url: event.url,
      category,
      hoursAhead: (eventDate.getTime() - now.getTime()) / 3_600_000,
    },
    suggestedAction: "review",
  };
}

export const macroCalendarDetector: Detector = {
  scope: "macro_event",
  async run(ctx: DetectorContext): Promise<DetectorSignal[]> {
    const results = await Promise.all(MACRO_FEEDS.map(fetchMacroFeed));

    const now = ctx.now.getTime();
    const cutoff = now + WINDOW_MS;

    const signals: DetectorSignal[] = [];
    for (const res of results) {
      for (const event of res.events) {
        if (event.impact !== "high") continue;
        if (!WATCH_COUNTRIES.has(event.country)) continue;
        if (event.allDay) continue;

        const t = new Date(event.startUtc).getTime();
        if (Number.isNaN(t)) continue;
        if (t <= now) continue;
        if (t > cutoff) continue;

        signals.push(buildSignal(event, ctx.now));
      }
    }

    return signals;
  },
};
