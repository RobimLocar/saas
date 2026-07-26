import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { refundCredits } from "@/lib/credits";
import { extractResultUrl, extractVideoUrl } from "@/lib/piapi/client";
import { auditLog, newRequestId, truncate } from "@/lib/audit-log";

/**
 * Webhook do PiAPI — chamado quando uma task conclui/falha.
 * Atualiza a geração no banco (status + result_url) e, em falha, estorna créditos
 * de forma idempotente. Registrado via config.webhook_config (ver client.ts).
 *
 * Segurança: valida o segredo do webhook (PIAPI_WEBHOOK_SECRET), aceitando tanto
 * um header de segredo em texto (x-webhook-secret) quanto uma assinatura HMAC
 * SHA256 do corpo cru. Se o segredo não estiver configurado, a validação é
 * ignorada (ambiente de desenvolvimento).
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// Comparação em tempo constante para evitar timing attacks.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function verifySignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.PIAPI_WEBHOOK_SECRET;
  // Sem segredo configurado → não valida (dev). Em produção o segredo existe.
  if (!secret) return true;

  // 1) Segredo em texto puro (header direto).
  const headerSecret =
    headers.get("x-webhook-secret") ||
    headers.get("x-piapi-secret") ||
    headers.get("x-api-key");
  if (headerSecret && safeEqual(headerSecret, secret)) return true;

  // 2) Assinatura HMAC SHA256 do corpo cru (aceita hex, com ou sem prefixo).
  const sigHeader =
    headers.get("x-signature") ||
    headers.get("x-webhook-signature") ||
    headers.get("x-piapi-signature") ||
    "";
  if (sigHeader) {
    const provided = sigHeader.replace(/^sha256=/i, "").trim().toLowerCase();
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (provided.length === expected.length && safeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const t0 = Date.now();
  try {
    // Lê o corpo CRU para poder validar a assinatura HMAC.
    const rawBody = await req.text();

    if (!verifySignature(rawBody, req.headers)) {
      auditLog("api.webhooks.piapi", "assinatura_invalida_401", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    }

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

    const { data: generation } = await supabase
      .from("generations")
      .select("*")
      .eq("provider_task_id", task_id)
      .single();

    if (!generation) {
      auditLog("api.webhooks.piapi", "generation_nao_encontrada", requestId, { task_id }, Date.now() - t0);
      return NextResponse.json({ ok: true });
    }

    // Já finalizada — nada a fazer (idempotência do webhook).
    if (generation.status === "completed" || generation.status === "failed") {
      auditLog("api.webhooks.piapi", "ja_finalizada", requestId, {
        generation_id: generation.id,
        status: generation.status,
      }, Date.now() - t0);
      return NextResponse.json({ ok: true });
    }

    // ── Task falhou ────────────────────────────────────────────────────────
    if (status === "failed" || status === "error") {
      const providerMsg =
        typeof error === "string"
          ? error
          : (error as { message?: string })?.message ||
            (error ? JSON.stringify(error) : "") ||
            "Erro no provedor de IA";
      const errMsg = `O provider rejeitou a solicitação: ${providerMsg}`;

      await supabase
        .from("generations")
        .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
        .eq("id", generation.id);

      // Estorno IDEMPOTENTE (§3.3).
      const refund = await refundCredits(
        supabase,
        generation.user_id,
        generation.id,
        generation.credits_used,
        requestId
      );

      auditLog("api.webhooks.piapi", "task_failed_estorno", requestId, {
        generation_id: generation.id,
        provider_error: truncate(providerMsg, 500),
        estornou: refund.ok && "refunded" in refund ? refund.refunded : false,
      }, Date.now() - t0);
      return NextResponse.json({ ok: true, action: "failed" });
    }

    // ── Task concluída ─────────────────────────────────────────────────────
    if (status === "completed" && output) {
      const genParams = (generation.params as Record<string, unknown> | null) || {};
      const outputKey =
        typeof genParams.output_key === "string" ? genParams.output_key : undefined;
      const resultUrl =
        generation.type === "video"
          ? extractVideoUrl(output, outputKey)
          : extractResultUrl(output);

      if (!resultUrl) {
        auditLog("api.webhooks.piapi", "url_nao_extraida", requestId, {
          generation_id: generation.id,
          output: truncate(JSON.stringify(output), 1000),
        }, Date.now() - t0);
        return NextResponse.json({ ok: true });
      }

      // Path de Storage UNIFICADO com o polling (status/route.ts): singular
      // `{user_id}/{type}/{generation_id}.{ext}` — mesma convenção do bucket atual.
      const ext =
        generation.type === "image" ? "png" : generation.type === "video" ? "mp4" : "mp3";
      const storagePath = `${generation.user_id}/${generation.type}/${generation.id}.${ext}`;

      let finalUrl = resultUrl;
      try {
        const mediaRes = await fetch(resultUrl);
        const mediaBuffer = await mediaRes.arrayBuffer();
        const { error: upErr } = await supabase.storage
          .from("assets")
          .upload(storagePath, Buffer.from(mediaBuffer), {
            contentType:
              mediaRes.headers.get("content-type") ||
              (generation.type === "image"
                ? "image/png"
                : generation.type === "video"
                ? "video/mp4"
                : "audio/mpeg"),
            upsert: true,
          });
        if (!upErr) {
          const { data: publicData } = supabase.storage.from("assets").getPublicUrl(storagePath);
          if (publicData?.publicUrl) finalUrl = publicData.publicUrl;
        } else {
          auditLog("api.webhooks.piapi", "upload_storage_falhou", requestId, {
            generation_id: generation.id,
            error: upErr.message,
          }, Date.now() - t0);
        }
      } catch (storageErr) {
        auditLog("api.webhooks.piapi", "storage_excecao_fallback_provider", requestId, {
          generation_id: generation.id,
          error: storageErr instanceof Error ? storageErr.message : String(storageErr),
        }, Date.now() - t0);
      }

      await supabase
        .from("generations")
        .update({ status: "completed", result_url: finalUrl, updated_at: new Date().toISOString() })
        .eq("id", generation.id);

      auditLog("api.webhooks.piapi", "task_completed", requestId, {
        generation_id: generation.id,
        result_url: truncate(finalUrl, 300),
      }, Date.now() - t0);
      return NextResponse.json({ ok: true, action: "completed" });
    }

    // Estados intermediários (processing/pending/staged) — apenas sincroniza.
    if (status && status !== generation.status) {
      await supabase
        .from("generations")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", generation.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook/piapi] Error:", err);
    auditLog("api.webhooks.piapi", "excecao_500", requestId, {
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
