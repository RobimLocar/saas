// Matemática PURA do multiplicador de consumo por plano (sem Supabase/rede).
// Fonte única do arredondamento `ceil(base × mult)` — reutilizada pelo servidor
// (credits.ts → effectiveCost) e pelo cliente (Studio dock → estimativa), para
// que a estimativa da UI seja SEMPRE idêntica à cobrança do servidor.

import { PLAN_COST_MULTIPLIER } from "@/lib/constants";

/** Multiplicador de consumo do plano (planos desconhecidos = 1). */
export function planMultiplier(plan: string): number {
  return PLAN_COST_MULTIPLIER[plan] ?? 1;
}

/** Aplica um multiplicador numérico já conhecido (usado pela UI, que recebe o
 *  multiplicador do plano via /api/models). Arredonda para cima. */
export function applyPlanMultiplierValue(baseCredits: number, multiplier: number): number {
  return Math.ceil(baseCredits * multiplier);
}

/** Aplica o multiplicador do plano (usado pelo servidor). Mesma matemática. */
export function applyPlanMultiplier(baseCredits: number, plan: string): number {
  return applyPlanMultiplierValue(baseCredits, planMultiplier(plan));
}
