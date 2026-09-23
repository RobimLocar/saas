import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAtlasWebhook, type JwkResolver } from "@/lib/atlas/webhook-verify";
import { normalizeAtlasEvent, upsertWebhookEvent } from "@/lib/webhooks/inbox";
import { auditLog, newRequestId } from "@/lib/audit-log";

// FLUXYRA-PRODUCTION-CLOSE-01 §4 — Webhook Atlas (Ed25519/JWKS), FAST-ACK.
// Contrato oficial atual (atlascloud.ai/docs/webhooks):
//   • assinatura Ed25519 sobre EXATAMENTE `${X-AtlasCloud-Webhook-Timestamp}.${raw_body}`
//     (bytes CRUS — verificar ANTES do JSON.parse);
//   • headers X-AtlasCloud-Webhook-Signature-Ed25519 (base64url), -Key-Id, -Timestamp;
//   • JWKS público em /api/v1/webhooks/jwks.json, cache por kid, re-fetch em kid novo;
//   • janela de replay ~5 min; idempotency por session_id (também em -Webhook-Id);
//   • payload: top-level status OK|ERROR, payload.outputs, payload.status, error.
// NÃO implementamos HMAC legado (integração nova). Correlação = callback_token (URL,
// opaco, por-task). O trabalho real (P8/P7) fica no processor — aqui só inbox + ACK.

export const runtime = "nodejs";

const JWKS_URL =
  process.env.ATLAS_JWKS_URL || "https://api.atlascloud.ai/api/v1/webhooks/jwks.json";

// Resolver de JWK por kid (a verificação já cacheia por kid; isto só roda em miss).
const resolveJwk: JwkResolver = async (kid: string) => {
  try {
    const res = await fetch(JWKS_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: Array<Record<string, unknown>> };
    const key = (body.keys || []).find((k) => k.kid === kid);
    return (key as import("node:crypto").JsonWebKey) || null;
  } catch {
    return null;
  }
};

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const requestId = newRequestId();
  const t0 = Date.now();
  try {
    const { token } = await params;

    // Raw bytes ANTES de qualquer parse (a assinatura cobre o corpo cru).
    const rawBuf = Buffer.from(await req.arrayBuffer());

    const verify = await verifyAtlasWebhook({
      rawBody: rawBuf,
      timestampHeader: req.headers.get("x-atlascloud-webhook-timestamp"),
      signatureHeader:
        req.headers.get("x-atlascloud-webhook-signature-ed25519") ||
        req.headers.get("x-atlascloud-webhook-signature"),
      kid: req.headers.get("x-atlascloud-webhook-key-id"),
      getJwk: resolveJwk,
    });
    if (!verify.ok) {
      auditLog("api.webhooks.atlas", "assinatura_invalida_401", requestId, {
        reason: verify.reason,
      }, Date.now() - t0);
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBuf.toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const sessionId = (parsed.session_id as string) || "";
    const topStatus = (parsed.status as string) || ""; // OK | ERROR
    const payload = (parsed.payload as Record<string, unknown> | undefined) || undefined;
    const outputs = payload?.outputs;
    const errText =
      (parsed.error as string) ||
      (payload && typeof payload.status === "string" && payload.status === "timeout"
        ? "timeout"
        : null);

    if (!sessionId) {
      return NextResponse.json({ error: "session_id obrigatório" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Correlação por callback_token (opaco, per-task). A assinatura prova ORIGEM
    // Atlas; o token prova que é uma task NOSSA (o doc pede correlacionar session_id
    // a uma task criada por nós antes de agir).
    const { data: generation } = await supabase
      .from("generations")
      .select("id, status, provider_task_id")
      .eq("callback_token", token)
      .single();

    if (!generation) {
      auditLog("api.webhooks.atlas", "generation_nao_encontrada", requestId, {
        token_prefix: token.slice(0, 6),
      }, Date.now() - t0);
      // 200 para não gerar retry infinito de um token desconhecido.
      return NextResponse.json({ ok: true });
    }

    // Idempotência: estado terminal imutável.
    if (generation.status === "completed" || generation.status === "failed") {
      return NextResponse.json({ ok: true });
    }

    // §7 — reconciliação de submission_unknown: se a session apareceu, a task existe.
    // Fixa provider_task_id (correlação futura do poll) e sai de submission_unknown.
    if (!generation.provider_task_id || generation.status === "submission_unknown") {
      await supabase
        .from("generations")
        .update({ provider_task_id: sessionId, status: "processing" })
        .eq("id", generation.id);
    }

    const ev = normalizeAtlasEvent({
      sessionId,
      status: topStatus,
      outputs,
      error: errText,
    });

    // Não-terminal → apenas ACK (mantém vivo; poll/próximo webhook resolvem).
    if (!ev.terminalStatus) {
      return NextResponse.json({ ok: true });
    }

    const inbox = await upsertWebhookEvent(supabase, ev, generation.id);
    auditLog("api.webhooks.atlas", "inbox_enfileirado", requestId, {
      generation_id: generation.id,
      session_id: sessionId,
      terminal: ev.terminalStatus,
      inserted: inbox.inserted,
    }, Date.now() - t0);

    return NextResponse.json({ ok: true, queued: true });
  } catch (err) {
    auditLog("api.webhooks.atlas", "excecao_500", requestId, {
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
