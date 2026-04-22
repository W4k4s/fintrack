// Strategy V2 Refactor R1 — helpers puros para el cálculo de health.
// Extraído de src/app/api/strategy/health/route.ts para testabilidad.

export interface ProfileHealthInputs {
  monthlyFixedExpenses: number;
  emergencyMonths: number;
}

export interface GoalLike {
  id: number;
  type: "net_worth" | "asset_target" | "savings_rate" | "emergency_fund" | "custom";
  targetValue: number;
}

/**
 * Devuelve el target efectivo para un goal. Para emergency_fund derivamos
 * monthlyFixedExpenses * emergencyMonths (SSOT R1) ignorando el targetValue
 * stored en DB — así cambiar cualquiera de los 2 campos del profile refleja
 * en la UI sin tocar la tabla goals.
 *
 * Para otros tipos de goal devolvemos goal.targetValue tal cual.
 */
export function effectiveGoalTarget(goal: GoalLike, profile: ProfileHealthInputs): number {
  if (goal.type === "emergency_fund") {
    return Math.max(0, profile.monthlyFixedExpenses * profile.emergencyMonths);
  }
  return goal.targetValue;
}

export function emergencyTargetEur(profile: ProfileHealthInputs): number {
  return Math.max(0, profile.monthlyFixedExpenses * profile.emergencyMonths);
}
