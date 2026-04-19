/**
 * Clasificación de ejecución: dado planned vs actual, decide si la order se
 * marca como `executed` (>=80% del plan) o `partial` (entre >0 y <80%).
 *
 * Umbral ajustable. 0.8 aguanta redondeo a 10€ del plan + fees sobre órdenes
 * pequeñas sin caer en partial. Por debajo de 0.8 suele indicar que la
 * operación se hizo en varias tandas o se desvió deliberadamente.
 */
export const PARTIAL_THRESHOLD_RATIO = 0.8;

export type ExecutionStatus = "executed" | "partial" | "dismissed";

export function classifyExecution(
  actualEur: number | null | undefined,
  plannedEur: number,
): ExecutionStatus {
  if (actualEur == null || !Number.isFinite(actualEur) || actualEur <= 0) {
    return "dismissed";
  }
  if (plannedEur <= 0) return "executed";
  return actualEur >= plannedEur * PARTIAL_THRESHOLD_RATIO ? "executed" : "partial";
}

export function partialPct(actualEur: number, plannedEur: number): number {
  if (plannedEur <= 0) return 100;
  return Math.round((actualEur / plannedEur) * 100);
}
