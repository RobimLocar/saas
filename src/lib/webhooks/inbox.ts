import type { SupabaseClient } from "@supabase/supabase-js";

// VIDEO-RELIABILITY-IMPLEMENT-01 — Inbox durável de eventos de webhook.
// Ingress: normaliza → upsert idempotente (dedupe por provider+event_key) → ACK rápido.
// Processor: claim/lease atômico (RPCs) → P8 persist / P7 refund. NÃO baixa mídia no ingress.

export type ProviderName = "piapi" | "atlas";

export interface NormalizedEvent {
  provider: ProviderName;
  eventKey: string; // dedupe: atlas=session_id ; piapi=`${task_id}:${status}`
  terminalStatus: "completed" | "failed" | null; // null = não-terminal (ignorar)
  providerTaskId: string | null;
  outputs: string[];
  error: string | null;
}

/** Atlas: session_id = idempotency key oficial. status OK|ERROR. */
export function normalizeAtlasEvent(args: {
  sessionId: string;
  status: string; // "OK" | "ERROR" | "succeeded" | "failed"
  outputs?: unknown;
  error?: string | null;
}): NormalizedEvent {
  const s = (args.status || "").toLowerCase();
  const terminal =
    s === "ok" || s === "succeeded" || s === "success" || s === "completed"
      ? "completed"
      : s === "error" || s === "failed"
        ? "failed"
        : null;
  const outputs = Array.isArray(args.outputs)
    ? (args.outputs as unknown[]).filter((o): o is string => typeof o === "string" && o.length > 0)
    : [];
  return {
    provider: "atlas",
    eventKey: args.sessionId,
    terminalStatus: terminal as NormalizedEvent["terminalStatus"],
    providerTaskId: args.sessionId,
    outputs,
    error: args.error ?? null,
  };
}

/** PiAPI: task_id + terminal status como identidade (timestamp NÃO é a chave). */
export function normalizePiapiEvent(args: {
  taskId: string;
  status: string; // "completed" | "failed" | "processing" ...
  outputs?: string[];
  error?: string | null;
}): NormalizedEvent {
  const s = (args.status || "").toLowerCase();
  const terminal = s === "completed" ? "completed" : s === "failed" || s === "error" ? "failed" : null;
  return {
    provider: "piapi",
    eventKey: `${args.taskId}:${terminal ?? s}`,
    terminalStatus: terminal as NormalizedEvent["terminalStatus"],
    providerTaskId: args.taskId,
    outputs: Array.isArray(args.outputs) ? args.outputs.filter((u) => typeof u === "string") : [],
    error: args.error ?? null,
  };
}

/**
 * Insere o evento no inbox (idempotente: dup por provider+event_key → no-op).
 * Retorna { inserted } — false quando já existia (reentrega). NUNCA baixa mídia aqui.
 */
export async function upsertWebhookEvent(
  service: SupabaseClient,
  ev: NormalizedEvent,
  generationId: string | null
): Promise<{ ok: boolean; inserted: boolean }> {
  const { error } = await service.from("provider_webhook_events").insert({
    provider: ev.provider,
    provider_event_key: ev.eventKey,
    generation_id: generationId,
    provider_task_id: ev.providerTaskId,
    terminal_status: ev.terminalStatus,
    outputs: ev.outputs.length > 0 ? ev.outputs : null,
    error: ev.error,
  });
  if (error) {
    // 23505 = unique_violation → já recebido (at-least-once); tratado como sucesso.
    if ((error as { code?: string }).code === "23505") return { ok: true, inserted: false };
    return { ok: false, inserted: false };
  }
  return { ok: true, inserted: true };
}
