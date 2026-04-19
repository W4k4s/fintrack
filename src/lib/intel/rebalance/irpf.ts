/**
 * IRPF España 2026 — base del ahorro.
 *
 * Tramos acumulativos aplicados sobre la base del ahorro TOTAL (ganancias
 * patrimoniales + rendimientos del capital mobiliario, compensados entre sí
 * con reglas específicas). Este módulo NO modela dividendos ni el residuo
 * 25% AEAT: se limita a calcular IRPF marginal sobre ganancia nueva cuando
 * ya hay `alreadyRealizedYtdEur` en la base.
 */

export interface IrpfTramo {
  from: number;
  /** null = infinito (último tramo). */
  to: number | null;
  rate: number;
}

export const TRAMOS_AEAT_2026: IrpfTramo[] = [
  { from: 0, to: 6000, rate: 0.19 },
  { from: 6000, to: 50000, rate: 0.21 },
  { from: 50000, to: 200000, rate: 0.23 },
  { from: 200000, to: 300000, rate: 0.27 },
  { from: 300000, to: null, rate: 0.28 },
];

/**
 * Calcula IRPF marginal sobre un incremento de ganancia dado que el usuario
 * ya ha realizado `alreadyRealizedYtdEur` en el año. Los tramos se aplican
 * a partir del punto donde el YTD ya se encuentra.
 *
 * Ejemplo: YTD = 4000, gain = 5000 →
 *   primeros 2000 cubren tramo 0-6k al 19% = 380
 *   siguientes 3000 van al tramo 6k-50k al 21% = 630
 *   total = 1010
 */
export function irpfOnGain(
  gainEur: number,
  alreadyRealizedYtdEur: number,
  tramos: IrpfTramo[] = TRAMOS_AEAT_2026,
): number {
  if (!Number.isFinite(gainEur) || gainEur <= 0) return 0;
  let tax = 0;
  let cursor = Math.max(0, alreadyRealizedYtdEur);
  let remaining = gainEur;

  for (const t of tramos) {
    if (remaining <= 0) break;
    const tramoEnd = t.to ?? Infinity;
    if (cursor >= tramoEnd) continue;
    const entryPoint = Math.max(cursor, t.from);
    const roomInTramo = tramoEnd - entryPoint;
    const taxable = Math.min(remaining, roomInTramo);
    if (taxable <= 0) continue;
    tax += taxable * t.rate;
    cursor = entryPoint + taxable;
    remaining -= taxable;
  }

  return tax;
}

/**
 * Severidad del coste fiscal de un plan. Eleva la severity cuando el IRPF
 * es alto aunque el drift por clase sea modesto.
 */
export function irpfSeverity(
  irpfEur: number,
): "low" | "med" | "high" | "critical" {
  if (irpfEur >= 5000) return "critical";
  if (irpfEur >= 1500) return "high";
  if (irpfEur >= 500) return "med";
  return "low";
}
