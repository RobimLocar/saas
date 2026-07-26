import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit-log";
import { FREE_PLAN_COST_MULTIPLIER } from "@/lib/constants";

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
 * Débito atômico via compare-and-swap: só desconta se o saldo for suficiente.
 * Faz até `maxRetries` tentativas para tolerar concorrência (outra geração
 * debitando ao mesmo tempo). Registra o débito no ledger (reason "generation").
 */
export async function debitCredits(
  service: SupabaseClient,
  userId: string,
  amount: number,
  jobId: string,
  requestId?: string,
  maxRetries = 4
): Promise<DebitResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: profile, error: readErr } = await service
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .single();

    if (readErr || !profile) {
      return { ok: false, error: readErr?.message || "perfil não encontrado" };
    }

    const current = profile.credits_balance as number;
    if (current < amount) {
      return { ok: false, insufficient: true };
    }

    // CAS: só atualiza se o saldo AINDA for exatamente `current` (ninguém mexeu
    // entre o SELECT e o UPDATE). `.select()` retorna a linha só se casou.
    const { data: updated, error: updErr } = await service
      .from("profiles")
      .update({ credits_balance: current - amount })
      .eq("id", userId)
      .eq("credits_balance", current)
      .select("credits_balance")
      .maybeSingle();

    if (updErr) {
      return { ok: false, error: updErr.message };
    }
    if (!updated) {
      // Saldo mudou concorrentemente — tenta de novo com o valor atualizado.
      continue;
    }

    // Débito confirmado → registra no ledger.
    await service.from("credit_transactions").insert({
      user_id: userId,
      amount: -amount,
      reason: "generation",
      related_job_id: jobId,
    });

    auditLog("credits.debit", "ok", requestId || "-", {
      user_id: userId,
      job_id: jobId,
      amount,
      balance_after: updated.credits_balance,
      attempt: attempt + 1,
    });
    return { ok: true, balance: updated.credits_balance as number };
  }

  return { ok: false, error: "conflito de concorrência ao debitar (retries esgotados)" };
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
  // 1) Idempotência: já existe refund para este job?
  const { data: existing, error: exErr } = await service
    .from("credit_transactions")
    .select("id")
    .eq("related_job_id", jobId)
    .eq("reason", "refund")
    .limit(1);

  if (exErr) {
    return { ok: false, error: exErr.message };
  }
  if (existing && existing.length > 0) {
    auditLog("credits.refund", "ja_estornado", requestId || "-", {
      user_id: userId,
      job_id: jobId,
    });
    return { ok: true, refunded: false };
  }

  // 2) Determinar o valor a estornar (do débito original, se não informado).
  let refundAmount = amount;
  if (refundAmount == null) {
    const { data: debit } = await service
      .from("credit_transactions")
      .select("amount")
      .eq("related_job_id", jobId)
      .eq("reason", "generation")
      .limit(1)
      .maybeSingle();
    if (debit) refundAmount = Math.abs(debit.amount as number);
  }
  if (!refundAmount || refundAmount <= 0) {
    return { ok: true, refunded: false };
  }

  // 3) Creditar de volta.
  const { data: profile, error: readErr } = await service
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();
  if (readErr || !profile) {
    return { ok: false, error: readErr?.message || "perfil não encontrado" };
  }
  const restored = (profile.credits_balance as number) + refundAmount;

  const { error: updErr } = await service
    .from("profiles")
    .update({ credits_balance: restored })
    .eq("id", userId);
  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  // 4) Registrar o estorno no ledger (marca a idempotência para chamadas futuras).
  await service.from("credit_transactions").insert({
    user_id: userId,
    amount: refundAmount,
    reason: "refund",
    related_job_id: jobId,
  });

  auditLog("credits.refund", "estornado", requestId || "-", {
    user_id: userId,
    job_id: jobId,
    amount: refundAmount,
    balance_after: restored,
  });
  return { ok: true, refunded: true, balance: restored };
}

/** Custo efectivo do modelo para o plano do utilizador.
 * Plano free paga 2x (surcharge). Outros planos pagam o custo base. */
export function effectiveCost(baseCost: number, plan: string): number {
  return plan === "free" ? Math.ceil(baseCost * FREE_PLAN_COST_MULTIPLIER) : baseCost;
}
