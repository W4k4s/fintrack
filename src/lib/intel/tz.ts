const MADRID_TZ = "Europe/Madrid";

/**
 * Partes de una fecha en timezone Europe/Madrid. Usa Intl.DateTimeFormat para
 * manejar DST correctamente (CET↔CEST).
 *
 * dayOfWeek: 0=Dom, 1=Lun, ... 6=Sáb (compatible con Date#getDay).
 */
export interface MadridParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
  isoDate: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function madridParts(d: Date = new Date()): MadridParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: MADRID_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // Intl devuelve 24 para medianoche en algunos entornos
  const minute = Number(parts.minute);
  const dayOfWeek = WEEKDAY_MAP[parts.weekday] ?? 0;
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;

  return { year, month, day, hour, minute, dayOfWeek, isoDate };
}

export function isQuietHourMadrid(d: Date = new Date()): boolean {
  const { hour } = madridParts(d);
  return hour >= 23 || hour < 8;
}

/**
 * ISO semana key "YYYY-Www" basada en fecha Madrid. Lunes como inicio de semana.
 */
export function madridWeekKey(d: Date = new Date()): string {
  const { year, month, day } = madridParts(d);
  // construye fecha UTC representativa del día Madrid a mediodía para evitar problemas DST
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const target = new Date(utc);
  const dayNum = (target.getUTCDay() + 6) % 7; // lunes=0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
