// Hierarquia de planos do Fluxyra — usada para gating de modelos (min_plan).
import type { PlanCode } from "@/types/database";

const PLAN_RANK: Record<PlanCode, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
};

/** Retorna true se o plano do usuário atende ao plano mínimo exigido. */
export function planAllows(userPlan: string | null | undefined, minPlan: string | null | undefined): boolean {
  const user = PLAN_RANK[(userPlan as PlanCode) || "free"] ?? 0;
  const min = PLAN_RANK[(minPlan as PlanCode) || "free"] ?? 0;
  return user >= min;
}
