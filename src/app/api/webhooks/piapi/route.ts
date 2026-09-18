import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { extractResultUrls } from "@/lib/piapi/client";
import { normalizePiapiEvent, upsertWebhookEvent } from "@/lib/webhooks/inbox";
import { auditLog, newRequestId } from "@/lib/audit-log";

/**
 * Webhook do PiAPI — chamado quando uma task conclui/falha. Atualiza a geração
 * (status + result_url durável) e, em falha, estorna créditos de forma idempotente.
 * Registrado via config.webhook_config (client.ts) SOMENTE quando PUBLIC_BASE_URL e
 * PIAPI_WEBHOOK_SECRET existem.
 *
 * P8a — SEGURANÇA (FAIL-CLOSED): o contrato oficial do PiAPI é um SEGREDO
 * COMPARTILHADO no header `x-webhook-secret` (NÃO é assinatura criptográfica).
 *   • Sem PIAPI_WEBHOOK_SECRET configurado → 503 e NENHUM processamento (antes
 *     aceitava qualquer callback = fail-open).
 *   • Segredo configurado → só aceita `x-webhook-secret` == segredo (comparação em
 *     tempo constante). Headers/HMAC alternativos (não documentados) foram removidos.
 * A correlação por provider_task_id + a imutabilidade de estado terminal continuam
 * garantindo idempotência e que um callback só afeta uma geração do próprio Fluxyra.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

type SecretCheck = { ok: boolean; configured: boolean };
function verifyWebhookSecret(headers: Headers): SecretCheck {
  const secret = process.env.PIAPI_WEBHOOK_SECRET;
  if (!secret) return { ok: false, configured: false }; // FAIL-CLOSED
  const provided = headers.get("x-webhook-secret") || "";
  if (provided && safeEqual(provided, secret)) return { ok: true, configured: true };
  return { ok: false, configured: true };
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const t0 = Date.now();
  try {
    // Autenticação FAIL-CLOSED antes de qualquer leitura/efeito.
    const check = verifyWebhookSecret(req.headers);
    if (!check.configured) {
      // Segredo ausente → webhook desabilitado. NÃO processa (a entrega segue por
      // polling). Nunca aceita callback não autenticado.
      auditLog("api.webhooks.piapi", "webhook_sem_segredo_503", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
    }
    if (!check.ok) {
      auditLog("api.webhooks.piapi", "segredo_invalido_401", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const rawBody = await req.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      auditLog("api.webhooks.piapi", "body_invalido_400", requestId, {
        raw_preview: rawBody.slice(0, 200),
      }, Date.now() - t0);
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    // A PiAPI envia a task dentro de `data`; toleramos também o formato plano.
    const data = (parsed.data as Record<string, unknown>) || parsed;
    const task_id = (data.task_id as string) || (parsed.task_id as string);
    const status = (data.status as string) || (parsed.status as string);
    const output = (data.output as Record<string, unknown>) || undefined;
    const error = data.error ?? parsed.error;

    auditLog("api.webhooks.piapi", "entrada", requestId, {
      task_id,
      status,
      has_output: Boolean(output),
    });

    if (!task_id) {
      return NextResponse.json({ error: "task_id obrigatório" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // FLUXYRA-PRODUCTION-CLOSE-01 §3 — FAST-ACK. O caminho de ACK NÃO baixa mídia
    // nem chama persistProviderOutputs. Fluxo: authenticate → correlate → normalize
    // terminal → inbox durável → 2xx rápido. O processor (§5) faz P8 persist / P7
    // refund fora do request do webhook.
    //
    // Correlação: só age sobre uma geração criada pelo Fluxyra (provider_task_id).
    const { data: generation } = await supabase
      .from("generations")
      .select("id, type, params, status")
      .eq("provider_task_id", task_id)
      .single();

    if (!generation) {
      auditLog("api.webhooks.piapi", "generation_nao_encontrada", requestId, { task_id }, Date.now() - t0);
      return NextResponse.json({ ok: true });
    }

    // Estado terminal imutável — idempotência (reentrega at-least-once vira no-op).
    if (generation.status === "completed" || generation.status === "failed") {
      return NextResponse.json({ ok: true });
    }

    const lower = (status || "").toLowerCase();
    const isFailed = lower === "failed" || lower === "error";
    const isCompleted = lower === "completed";

    // Normaliza os outputs (extração barata de URL — SEM download) só p/ conclusão.
    let providerUrls: string[] = [];
    if (isCompleted && output) {
      const gp = (generation.params as Record<string, unknown> | null) || {};
      const outputKey = typeof gp.output_key === "string" ? gp.output_key : undefined;
      providerUrls = extractResultUrls(output, generation.type === "video", outputKey);
    }

    // Não-terminal, ou completed sem URL extraível ainda → ACK sem enfileirar (o
    // status-poll assume). NUNCA marca terminal aqui sem resultado entregável.
    if ((!isFailed && !isCompleted) || (isCompleted && providerUrls.length === 0)) {
      auditLog("api.webhooks.piapi", "ack_nao_terminal", requestId, {
        generation_id: generation.id,
        status: lower,
        has_url: providerUrls.length > 0,
      }, Date.now() - t0);
      return NextResponse.json({ ok: true });
    }

    const providerMsg = isFailed
      ? typeof error === "string"
        ? error
        : (error as { message?: string })?.message || (error ? JSON.stringify(error) : "") || "Erro no provedor de IA"
      : null;

    const ev = normalizePiapiEvent({
      taskId: task_id,
      status: lower,
      outputs: providerUrls,
      error: providerMsg,
    });

    // Inbox durável (dedupe por provider+event_key). ACK rápido; processor drena.
    const inbox = await upsertWebhookEvent(supabase, ev, generation.id);
    auditLog("api.webhooks.piapi", "inbox_enfileirado", requestId, {
      generation_id: generation.id,
      event_key: ev.eventKey,
      terminal: ev.terminalStatus,
      inserted: inbox.inserted,
    }, Date.now() - t0);

    return NextResponse.json({ ok: true, queued: true });
  } catch (err) {
    console.error("[webhook/piapi] Error:", err);
    auditLog("api.webhooks.piapi", "excecao_500", requestId, {
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
