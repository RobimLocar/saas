import type { SupabaseClient } from "@supabase/supabase-js";
import { refundCredits } from "@/lib/credits";
import { persistProviderOutputs } from "@/lib/media/persist-result";
import { markFreeImageTrialUsed, releaseFreeImageTrial } from "@/lib/trials";

// FLUXYRA-PRODUCTION-CLOSE-01 §5 — Processor/drainer do inbox durável de webhooks.
// NÃO baixa mídia no ingress; o trabalho real (P8 persist / P7 refund) acontece AQUI.
// Claim/lease ATÔMICO via RPC (2 drainers → só 1 pega cada evento; lease expira →
// recovery). Idempotente: evento de generation já-terminal = no-op. Postgres-only
// (sem Kafka/Redis/serviço externo). Pode rodar por cron OU inline no status poll.

const MAX_ATTEMPTS_BEFORE_GIVEUP = 6;

interface WebhookEventRow {
  id: string;
  provider: string;
  provider_event_key: string;
  generation_id: string | null;
  provider_task_id: string | null;
  terminal_status: string | null;
  outputs: unknown;
  error: string | null;
  attempts: number;
}

export interface DrainResult {
  claimed: number;
  processed: number;
  rescheduled: number;
}

/**
 * Drena até `limit` eventos do inbox. Cada evento é reivindicado atomicamente
 * (claim_webhook_events) e processado exatamente uma vez enquanto o lease durar.
 */
export async function drainWebhookEvents(
  service: SupabaseClient,
  opts: { limit?: number; requestId?: string } = {}
): Promise<DrainResult> {
  const limit = opts.limit ?? 10;
  const { data: claimed, error: claimErr } = await service.rpc("claim_webhook_events", {
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (claimErr || !Array.isArray(claimed)) {
    return { claimed: 0, processed: 0, rescheduled: 0 };
  }

  let processed = 0;
  let rescheduled = 0;
  for (const ev of claimed as WebhookEventRow[]) {
    try {
      await processOneEvent(service, ev);
      await service.rpc("mark_webhook_event_processed", { p_id: ev.id });
      processed++;
    } catch (e) {
      const backoff = Math.min(60 * Math.pow(2, ev.attempts), 30 * 60); // até 30min
      await service.rpc("reschedule_webhook_event", {
        p_id: ev.id,
        p_backoff_seconds: backoff,
        p_error: e instanceof Error ? e.message : String(e),
      });
      rescheduled++;
    }
  }
  return { claimed: claimed.length, processed, rescheduled };
}

/** Aplica um evento terminal a uma generation (P8 persist / P7 refund). Idempotente. */
async function processOneEvent(service: SupabaseClient, ev: WebhookEventRow): Promise<void> {
  // Resolver a generation: preferir generation_id (setado no ingress); fallback por
  // provider_task_id (PiAPI correlaciona por task_id).
  let generation: Record<string, unknown> | null = null;
  if (ev.generation_id) {
    const { data } = await service.from("generations").select("*").eq("id", ev.generation_id).single();
    generation = data;
  }
  if (!generation && ev.provider_task_id) {
    const { data } = await service
      .from("generations")
      .select("*")
      .eq("provider_task_id", ev.provider_task_id)
      .single();
    generation = data;
  }
  // Sem generation correlacionável → nada a fazer (não é erro; marca processed).
  if (!generation) return;

  const status = generation.status as string;
  // Estado terminal imutável — idempotência (reentrega/at-least-once).
  if (status === "completed" || status === "failed") return;

  const genId = generation.id as string;
  const userId = generation.user_id as string;
  const credits = generation.credits_used as number;
  const genParams = (generation.params as Record<string, unknown> | null) || {};
  const isTrial = (genParams.free_trial as boolean) === true;

  // ── Falha terminal ────────────────────────────────────────────────────────
  if (ev.terminal_status === "failed") {
    const errMsg = `O provider rejeitou a solicitação: ${ev.error || "erro"}`;
    await service
      .from("generations")
      .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
      .eq("id", genId);
    await refundCredits(service, userId, genId, credits, `drain:${ev.id}`);
    if (isTrial) await releaseFreeImageTrial(service, genId);
    return;
  }

  // ── Conclusão terminal ──────────────────────────────────────────────────────
  if (ev.terminal_status === "completed") {
    const outputs = Array.isArray(ev.outputs)
      ? (ev.outputs as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];
    if (outputs.length === 0) {
      // Terminal-completed sem URL extraível: pode chegar depois (poll). Reprocessa
      // com backoff; após N tentativas desiste (o status-poll assume). Lança p/ reschedule.
      if (ev.attempts >= MAX_ATTEMPTS_BEFORE_GIVEUP) return;
      throw new Error("completed sem outputs — aguardando URL");
    }

    // Saída de TEXTO (ASR/lyrics do Atlas): não persiste mídia.
    if (genParams.atlas_output_kind === "text") {
      await service
        .from("generations")
        .update({
          status: "completed",
          updated_at: new Date().toISOString(),
          params: { ...genParams, result_text: outputs[0] },
        })
        .eq("id", genId);
      return;
    }

    // Mídia → P8 durável (all-or-nothing), NUNCA URL do provider.
    const persisted = await persistProviderOutputs(service, {
      userId,
      generationId: genId,
      type: generation.type as string,
      providerUrls: outputs,
    });
    if (!persisted.ok) {
      const errMsg = "Não foi possível salvar o resultado da geração. Seus créditos foram estornados.";
      await service
        .from("generations")
        .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
        .eq("id", genId);
      await refundCredits(service, userId, genId, credits, `drain:${ev.id}`);
      if (isTrial) await releaseFreeImageTrial(service, genId);
      return;
    }
    const storedUrls = persisted.urls;
    const patch: Record<string, unknown> = {
      status: "completed",
      result_url: storedUrls[0],
      updated_at: new Date().toISOString(),
    };
    if (storedUrls.length > 1) patch.params = { ...genParams, result_urls: storedUrls };
    await service.from("generations").update(patch).eq("id", genId);
    if (isTrial) await markFreeImageTrialUsed(service, genId);
    return;
  }

  // terminal_status null (não-terminal) — não deveria entrar no inbox; no-op.
}
