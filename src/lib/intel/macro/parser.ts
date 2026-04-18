import { XMLParser } from "fast-xml-parser";

export type MacroImpact = "low" | "medium" | "high" | "holiday";

export interface MacroEvent {
  title: string;
  country: string;
  impact: MacroImpact;
  startUtc: string;
  forecast: string | null;
  previous: string | null;
  url: string | null;
  allDay: boolean;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
  cdataPropName: "__cdata",
});

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.__cdata === "string") return obj.__cdata;
    if (typeof obj["#text"] === "string") return obj["#text"] as string;
  }
  return "";
}

function parseImpact(raw: string): MacroImpact {
  const s = raw.toLowerCase();
  if (s.startsWith("high")) return "high";
  if (s.startsWith("med")) return "medium";
  if (s.startsWith("low")) return "low";
  return "holiday";
}

/**
 * ForexFactory reporta horas en Eastern Time (ET). Aproximamos el offset según
 * reglas DST US: EDT (-4) de marzo–noviembre, EST (-5) el resto. Los bordes
 * exactos (second Sunday de marzo, first Sunday de noviembre) se ajustan
 * heurísticamente; aceptamos <2 semanas al año de posible drift para MVP.
 */
function etOffsetHours(year: number, month: number, day: number): number {
  if (month > 3 && month < 11) return -4;
  if (month < 3 || month > 11) return -5;
  if (month === 3) return day >= 10 ? -4 : -5;
  if (month === 11) return day <= 2 ? -4 : -5;
  return -5;
}

/**
 * FF date: "MM-DD-YYYY"; time: "2:00pm", "11:50am", "All Day", "Tentative" o "".
 */
function parseEventTime(
  rawDate: string,
  rawTime: string,
): { startUtc: string; allDay: boolean } | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(rawDate.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  const timeStr = rawTime.trim().toLowerCase();
  const allDay = timeStr === "" || timeStr === "all day" || timeStr === "tentative";

  let hour = 0;
  let minute = 0;
  if (!allDay) {
    const t = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(timeStr);
    if (!t) return null;
    hour = Number(t[1]);
    minute = Number(t[2]);
    const ampm = t[3];
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
  }

  const offset = etOffsetHours(year, month, day);
  // Convert ET wall clock to UTC. If ET = UTC + offset (offset is negative),
  // then UTC hour = ET hour - offset = ET hour + |offset|.
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, 0));

  return { startUtc: utcDate.toISOString(), allDay };
}

export function parseMacroFeed(xml: string): MacroEvent[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const weekly = parsed.weeklyevents as Record<string, unknown> | undefined;
  const raw = weekly?.event;
  if (!raw) return [];

  const arr = Array.isArray(raw) ? raw : [raw];
  const events: MacroEvent[] = [];

  for (const node of arr) {
    const it = node as Record<string, unknown>;
    const title = text(it.title).trim();
    const country = text(it.country).trim().toUpperCase();
    const impact = parseImpact(text(it.impact));
    const rawDate = text(it.date);
    const rawTime = text(it.time);
    const forecast = text(it.forecast).trim() || null;
    const previous = text(it.previous).trim() || null;
    const url = text(it.url).trim() || null;

    if (!title || !country || !rawDate) continue;
    const parsedTime = parseEventTime(rawDate, rawTime);
    if (!parsedTime) continue;

    events.push({
      title,
      country,
      impact,
      startUtc: parsedTime.startUtc,
      allDay: parsedTime.allDay,
      forecast,
      previous,
      url,
    });
  }

  return events;
}
