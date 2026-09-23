import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit-log";
import { applyPlanMultiplier } from "@/lib/billing/plan-cost";

/**
 * Helpers de crédito — débito atômico (compare-and-swap) e estorno idempotente.
 *
 * IMPORTANTE (§3.3): o ideal é executar isto via RPC SQL no Postgres
 * (ver supabase/migrations/0002_rpc_credits.sql), que garante atomicidade real
 * dentro de uma transação. Como o banco hospedado não expõe DDL pela service
 * role (não há como aplicar a função por aqui), replicamos as MESMAS garantias
 * no lado da aplicação:
 *   - débito: UPDATE condicional com trava otimista no saldo lido (CAS + retry),
 *     nunca deixando o saldo ficar negativo mesmo sob concorrência;
 *   - estorno: idempotente — checa se já existe uma transação `refund` para o job
 *     antes de creditar, evitando estorno duplicado quando status-poll e webhook
 *     disparam ao mesmo tempo.
 *
 * As colunas seguem o schema de PRODUÇÃO (supabase/SCHEMA_PRODUCAO.md):
 *   profiles.credits_balance · credit_transactions(user_id, amount, reason, related_job_id)
 *   reason do débito = "generation"; reason do estorno = "refund".
 */

export type DebitResult =
  | { ok: true; balance: number }
  | { ok: false; insufficient: true }
  | { ok: false; error: string };

/**
 * P7b — Débito ATÔMICO via RPC `debit_credits` (decremento condicional + ledger
 * numa ÚNICA transação Postgres). Substitui o CAS de aplicação: agora balance e
 * ledger nunca divergem, e o saldo nunca fica negativo (a trava é `WHERE
 * credits_balance >= amount` dentro da função). Idempotência de débito não é
 * necessária (1 débito por geração). A API pública é preservada.
 *
 * ⚠ DEPLOYMENT COUPLING: exige a migration 20260906160000 aplicada. Sem a RPC, o
 * `.rpc` retorna erro → débito FALHA (fail-closed) — nunca cai em via não-atômica.
 *
 * (O antigo parâmetro `maxRetries` do CAS de aplicação foi removido — a RPC é
 * atômica e não precisa de retry no app; nenhum chamador o utilizava.)
 */
export async function debitCredits(
  service: SupabaseClient,
  userId: string,
  amount: number,
  jobId: string,
  requestId?: string
): Promise<DebitResult> {
  const { data, error } = await service.rpc("debit_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_job_id: jobId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  const res = String(data ?? "");
  if (res === "INSUFFICIENT") {
    return { ok: false, insufficient: true };
  }
  if (res === "NOOP") {
    return { ok: false, error: "valor de débito inválido" };
  }
  if (res.startsWith("APPLIED:")) {
    const balance = Number(res.slice("APPLIED:".length));
    auditLog("credits.debit", "ok", requestId || "-", {
      user_id: userId,
      job_id: jobId,
      amount,
      balance_after: balance,
    });
    return { ok: true, balance };
  }
  return { ok: false, error: `resposta inesperada do RPC debit_credits: ${res}` };
}

export type RefundResult =
  | { ok: true; refunded: boolean; balance?: number }
  | { ok: false; error: string };

/**
 * Estorno IDEMPOTENTE: credita de volta o valor do débito original apenas se
 * ainda não houver uma transação `refund` para o mesmo job. Seguro para ser
 * chamado por múltiplos caminhos (catch da criação, polling de status, webhook).
 *
 * @param amount valor a estornar. Se omitido, é derivado do débito original no ledger.
 */
export async function refundCredits(
  service: SupabaseClient,
  userId: string,
  jobId: string,
  amount?: number,
  requestId?: string
): Promise<RefundResult> {
  // P7b — Estorno ATÔMICO + idempotente por geração via RPC
  // `refund_generation_credits`: numa única transação, faz o CLAIM do refund
  // (UNIQUE parcial em related_job_id WHERE reason='refund') e o incremento ATÔMICO
  // do saldo (credits_balance = credits_balance + valor). O valor vem do débito
  // ORIGINAL no ledger (autoritativo); `amount` só é fallback quando o débito não
  // é encontrado. Dois refunds concorrentes → exatamente UM (o outro
  // ALREADY_APPLIED, sem mutação). Sem lost update contra débito concorrente.
  const { data, error } = await service.rpc("refund_generation_credits", {
    p_user_id: userId,
    p_job_id: jobId,
    p_fallback_amount: amount ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  const res = String(data ?? "");
  if (res === "ALREADY_APPLIED") {
    auditLog("credits.refund", "ja_estornado", requestId || "-", {
      user_id: userId,
      job_id: jobId,
    });
    return { ok: true, refunded: false };
  }
  if (res === "NOOP") {
    return { ok: true, refunded: false };
  }
  if (res.startsWith("APPLIED:")) {
    const balance = Number(res.slice("APPLIED:".length));
    auditLog("credits.refund", "estornado", requestId || "-", {
      user_id: userId,
      job_id: jobId,
      balance_after: balance,
    });
    return { ok: true, refunded: true, balance };
  }
  return { ok: false, error: `resposta inesperada do RPC refund_generation_credits: ${res}` };
}

/** Custo efetivo do modelo para o plano do usuário.
 * Não altera o preço-base: aplica um multiplicador de CONSUMO por plano
 * (free 2x · starter 1,3x · pro 1,1x · agency 1x — fonte única PLAN_COST_MULTIPLIER).
 * Planos desconhecidos = 1x. */
export function effectiveCost(baseCost: number, plan: string): number {
  // Fonte única do arredondamento (mesma usada pela estimativa da UI).
  return applyPlanMultiplier(baseCost, plan);
}
