import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSpeechAtlas, AtlasError } from "@/lib/atlas/client";
import {
  buildVideoPayload,
  submitVideoTask,
} from "@/lib/piapi/client";
import type { VideoModelParams } from "@/lib/piapi/client";
import { debitCredits, refundCredits, effectiveCost } from "@/lib/credits";
import { mapAccentToVoice } from "@/lib/tts-voices";
import { isSafeMediaUrl } from "@/lib/validate-generation";
import { auditLog, newRequestId } from "@/lib/audit-log";
import {
  resolveAvatarRate,
  avatarRawCredits,
  clampAvatarSeconds,
} from "@/lib/models/avatar-pricing";
import { randomUUID } from "node:crypto";
import { fingerprint } from "@/lib/idempotency";
import { normalizeIntentId, newCallbackToken } from "@/lib/webhooks/reliability-runtime";

/**
 * P10a — Mede a duração REAL do áudio de dublagem no SERVIDOR (music-metadata),
 * espelhando EXATAMENTE a rota de vídeo congelada (task_type="avatar"). O Kling
 * Avatar renderiza um vídeo do COMPRIMENTO DO ÁUDIO e cobra por esses segundos —
 * o provider ignora a duração da UI. Retorna 0 se não for possível medir (o
 * chamador DEVE tratar como fail-closed: sem submit, sem débito). Sem fallback
 * para a duração da UI.
 */
async function measureAudioSeconds(audioUrl: string, requestId: string): Promise<number> {
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) return 0;
    const buf = Buffer.from(await res.arrayBuffer());
    const mm = await import("music-metadata");
    const meta = await mm.parseBuffer(new Uint8Array(buf), {
      mimeType: res.headers.get("content-type") || undefined,
    });
    return Number(meta.format?.duration) || 0;
  } catch (e) {
    auditLog("api.ugc.segment", "avatar_audio_medicao_falhou", requestId, {
      error: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

const VALID_SEGMENT_KEYS = ["hook", "body1", "body2", "cta"] as const;
type SegmentKey = (typeof VALID_SEGMENT_KEYS)[number];

const VALID_DURATIONS = [4, 6, 8] as const;
const VALID_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
const VALID_FORMATS = ["9:16", "1:1", "16:9"] as const;

/** Bucket "uploads" (retrato/TTS) é público — URL retornada pelo upload é a pública */
async function rehostAudioIfNeeded(
  audioUrl: string,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string> {
  // Verificar se já é pública
  try {
    const head = await fetch(audioUrl, { method: "HEAD" });
    if (head.ok) return audioUrl;
  } catch {
    // Se HEAD falhar, tentar re-hospedar
  }

  // Baixar e re-hospedar no Supabase
  const dl = await fetch(audioUrl);
  if (!dl.ok) throw new Error(`Falha ao baixar áudio TTS (${dl.status})`);
  const buf = Buffer.from(await dl.arrayBuffer());
  const remotePath = `ugc/${userId}/tts_${Date.now()}.mp3`;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/uploads/${remotePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "audio/mpeg",
    },
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Re-host áudio falhou (${res.status}): ${t}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/uploads/${remotePath}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = newRequestId();
  const t0 = Date.now();

  try {
    const { id: projectId } = await params;
    const supabase = await createClient();
    const service = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      segment_key,
      text,
      accent = "Accent",
      duration = 6,
      resolution = "720p",
      format = "9:16",
      avatar_image_url,
      camera_angles = false,
      product_image_url,
    } = body;

    // ── Validação de entrada ──────────────────────────────────────────────────
    if (!VALID_SEGMENT_KEYS.includes(segment_key)) {
      return NextResponse.json(
        { error: `segment_key inválido. Aceito: ${VALID_SEGMENT_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    const segKey = segment_key as SegmentKey;
    const speechText = typeof text === "string" ? text.trim() : "";
    if (!speechText) {
      return NextResponse.json({ error: "O campo text é obrigatório" }, { status: 400 });
    }
    if (speechText.length > 2000) {
      return NextResponse.json({ error: "Texto muito longo (máx. 2000 caracteres)" }, { status: 400 });
    }

    const dur = VALID_DURATIONS.includes(duration as 4 | 6 | 8) ? (duration as number) : 6;

    const resLower = typeof resolution === "string" ? resolution.toLowerCase() : "720p";
    if (!VALID_RESOLUTIONS.includes(resLower as "720p" | "1080p" | "4k")) {
      return NextResponse.json({ error: "Resolução inválida. Use 720p, 1080p ou 4k" }, { status: 400 });
    }

    const formatValue =
      typeof format === "string" && VALID_FORMATS.includes(format as "9:16" | "1:1" | "16:9")
        ? (format as "9:16" | "1:1" | "16:9")
        : "9:16";

    // product_image_url: aceitar e validar URL, mas NÃO usar na geração (v1)
    if (product_image_url && typeof product_image_url === "string") {
      if (!isSafeMediaUrl(product_image_url)) {
        return NextResponse.json({ error: "product_image_url inválida ou insegura" }, { status: 400 });
      }
    }

    if (avatar_image_url && typeof avatar_image_url === "string") {
      if (!isSafeMediaUrl(avatar_image_url)) {
        return NextResponse.json({ error: "avatar_image_url inválida ou insegura" }, { status: 400 });
      }
    }

    auditLog("api.ugc.segment", "entrada", requestId, {
      user_id: user.id,
      project_id: projectId,
      segment_key: segKey,
      text_len: speechText.length,
      duration: dur,
      resolution: resLower,
      format: formatValue,
      camera_angles,
    });

    // ── Buscar projeto ────────────────────────────────────────────────────────
    const { data: project, error: projErr } = await supabase
      .from("ugc_projects")
      .select("id, user_id, avatar_image_url, segments")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    const avatarImageDefault =
      typeof project.avatar_image_url === "string" ? project.avatar_image_url.trim() : "";

    const avatarImageUrl =
      typeof avatar_image_url === "string" && avatar_image_url.trim()
        ? avatar_image_url.trim()
        : avatarImageDefault;

    if (!avatarImageUrl || !isSafeMediaUrl(avatarImageUrl)) {
      return NextResponse.json(
        { error: "O projeto não tem um retrato de avatar definido. Faça upload de uma imagem primeiro." },
        { status: 400 }
      );
    }

    // ── Buscar modelo kling-avatar (fonte da tarifa cps) ──────────────────────
    const { data: aiModel } = await supabase
      .from("ai_models")
      .select("id, credit_cost, params")
      .eq("model_id", "kling-avatar")
      .eq("is_active", true)
      .single();

    if (!aiModel) {
      return NextResponse.json({ error: "Modelo Kling Avatar não disponível" }, { status: 404 });
    }

    // ── Tarifa (créditos/seg) por resolução — MESMA regra da rota de vídeo ────
    // Kling Avatar cobra por segundo de vídeo gerado = comprimento do áudio.
    // Guard anti-subcobrança: NUNCA rebaixar alta-resolução sem tarifa p/ 720p.
    // (4k não tem cps no catálogo → bloqueado aqui, ANTES do TTS.)
    const modelParams = (aiModel.params as VideoModelParams) ?? {};
    const cpsMap = (modelParams as Record<string, unknown>).credit_per_second as
      | Record<string, unknown>
      | undefined;
    const rateResult = resolveAvatarRate(cpsMap, resLower);
    if (!rateResult.ok) {
      auditLog("api.ugc.segment", "resolucao_sem_tarifa_400", requestId, {
        resolution: resLower,
      });
      return NextResponse.json(
        { error: `Resolução ${resLower} sem tarifa configurada para o avatar.` },
        { status: 400 }
      );
    }
    const avatarRate = rateResult.rate;

    // ── Perfil (saldo + plano) ────────────────────────────────────────────────
    const { data: profile } = await service
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    const plan = profile?.plan ?? "free";
    const balance = profile?.credits_balance ?? 0;

    // ── Gate anti-abuso PRÉ-TTS (estimativa conservadora) ─────────────────────
    // O custo REAL depende da duração MEDIDA do áudio (só conhecida após o TTS).
    // Antes de gastar a chamada paga do Atlas, exigir que o usuário cubra uma
    // estimativa conservadora derivada do comprimento do texto. Impede que um
    // usuário sem saldo dispare TTS pago. Exposição residual (bounded): 1 TTS por
    // request, texto ≤2000 chars — ver relatório P10a FASE 9 (TTS COST RACE).
    const estSeconds = clampAvatarSeconds(Math.ceil(speechText.length / 12));
    const estBase = avatarRate > 0 ? avatarRawCredits(avatarRate, estSeconds) : aiModel.credit_cost;
    const estCost = effectiveCost(estBase, plan);
    if (balance < estCost) {
      return NextResponse.json(
        { error: "Créditos insuficientes", required: estCost, available: balance },
        { status: 402 }
      );
    }

    // ── Gerar TTS via Atlas ───────────────────────────────────────────────────
    const voiceId = mapAccentToVoice(accent);
    let audioPublicUrl: string;

    try {
      const rawAudioUrl = await generateSpeechAtlas({
        text: speechText,
        voice: voiceId,
        stability: 0.3,
      });

      // Re-hospedar se não estiver acessível publicamente
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      audioPublicUrl = await rehostAudioIfNeeded(rawAudioUrl, user.id, supabaseUrl, serviceRoleKey);

      auditLog("api.ugc.segment", "tts_ok", requestId, {
        voice: voiceId,
        accent,
        audio_url_len: audioPublicUrl.length,
      });
    } catch (ttsErr) {
      const msg = ttsErr instanceof AtlasError
        ? ttsErr.message
        : ttsErr instanceof Error ? ttsErr.message : "Erro ao gerar áudio TTS";
      auditLog("api.ugc.segment", "tts_falhou", requestId, { error: msg });
      return NextResponse.json({ error: `TTS falhou: ${msg}` }, { status: 502 });
    }

    // ── Duração REAL do áudio (medida no servidor) → custo EXATO ───────────────
    // Fail-closed: sem duração confiável NÃO submetemos o avatar e NÃO debitamos
    // (billed ≠ executed). Sem fallback para a duração da UI. O TTS já rodou
    // (custo Atlas bounded); nenhum crédito do usuário é mexido neste caminho.
    const measuredSeconds = await measureAudioSeconds(audioPublicUrl, requestId);
    if (!(measuredSeconds > 0)) {
      auditLog("api.ugc.segment", "avatar_sem_duracao_502", requestId, {});
      return NextResponse.json(
        {
          error:
            "Não foi possível medir a duração do áudio gerado. Nada foi cobrado; tente novamente.",
        },
        { status: 502 }
      );
    }
    const billedSeconds = clampAvatarSeconds(measuredSeconds);
    const avatarMode = resLower === "720p" ? "std" : "pro";
    // Fonte ÚNICA de custo BRUTO (compartilhada com a regra do vídeo): cps × seg.
    const baseCost =
      avatarRate > 0 ? avatarRawCredits(avatarRate, measuredSeconds) : aiModel.credit_cost;
    // Multiplicador de plano aplicado UMA vez, aqui.
    const cost = effectiveCost(baseCost, plan);

    auditLog("api.ugc.segment", "custo_avatar", requestId, {
      resolution: resLower,
      mode: avatarMode,
      rate_per_second: avatarRate,
      measured_seconds: measuredSeconds,
      billed_seconds: billedSeconds,
      base_credits: baseCost,
      plan,
      cost,
    });

    // ── §10 — INTENT IDEMPOTENCY (paridade com /api/generate/video) ────────────
    // INSERT ANTES do débito: o unique index (user_id, generation_intent_id) garante
    // 1 geração por intenção; um duplo-submit/retry NÃO gera 2º débito. Reexecução
    // deliberada do segmento envia nova intenção. Compartilha webhook/inbox/P8/P7 via
    // provider_task_id na mesma tabela generations. (Migration 140000 — unapplied.)
    const generationId = randomUUID();
    const intentId = normalizeIntentId((body as Record<string, unknown>)?.generation_intent_id);
    const callbackToken = newCallbackToken();
    const requestFingerprint = fingerprint({
      kind: "ugc-segment",
      project: projectId,
      seg: segKey,
      text: speechText,
      resolution: resLower,
      model: aiModel.id,
    });

    const generationParams = {
      ...modelParams,
      output_key: "output.video",
      segment_key: segKey,
      duration: dur,
      resolution: resLower,
      format: formatValue,
      accent,
      voice_id: voiceId,
      camera_angles,
      avatar_image_url: avatarImageUrl,
      audio_url: audioPublicUrl,
      // P10a — verdade de bilhetagem para auditoria/estorno posterior.
      avatar_mode: avatarMode,
      avatar_rate_per_second: avatarRate,
      avatar_measured_seconds: billedSeconds,
    };

    const { error: genInsertErr } = await service
      .from("generations")
      .insert({
        id: generationId,
        user_id: user.id,
        model_id: aiModel.id,
        type: "video",
        prompt: speechText.slice(0, 500),
        params: generationParams,
        status: "pending",
        credits_used: cost,
        generation_intent_id: intentId,
        request_fingerprint: requestFingerprint,
        callback_token: callbackToken,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (genInsertErr) {
      // Duplicata de intenção (23505) → retoma a geração existente SEM debitar.
      if ((genInsertErr as { code?: string }).code === "23505") {
        const { data: existing } = await service
          .from("generations")
          .select("id, status, credits_used")
          .eq("user_id", user.id)
          .eq("generation_intent_id", intentId)
          .single();
        if (existing) {
          auditLog("api.ugc.segment", "intent_resume", requestId, {
            generation_id: existing.id,
            status: existing.status,
          }, Date.now() - t0);
          return NextResponse.json({
            generation_id: existing.id,
            status: existing.status,
            resumed: true,
            cost: existing.credits_used,
          });
        }
      }
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
    }

    // ── Débito atômico APÓS reservar a intenção (1 débito por intenção) ─────────
    const debit = await debitCredits(service, user.id, cost, generationId, requestId);
    if (!debit.ok) {
      await service
        .from("generations")
        .update({ status: "failed", error_message: "Falha ao debitar créditos", updated_at: new Date().toISOString() })
        .eq("id", generationId);
      if ("insufficient" in debit && debit.insufficient) {
        return NextResponse.json(
          { error: "Créditos insuficientes", required: cost },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: "Erro ao debitar créditos" }, { status: 500 });
    }

    // ── Submeter task Kling Avatar ────────────────────────────────────────────
    let providerTaskId: string;

    try {
      const quality = resLower === "720p" ? "medium" : "high";
      const payload = buildVideoPayload({
        params: modelParams,
        prompt: speechText.slice(0, 500),
        quality,
        imageUrl: avatarImageUrl,
        dubbingAudioUrl: audioPublicUrl,
        referenceImages: camera_angles ? [avatarImageUrl, avatarImageUrl] : [],
        requestId,
      });

      const submitResult = await submitVideoTask(payload, requestId);
      providerTaskId = submitResult.data.task_id;

      auditLog("api.ugc.segment", "piapi_submetido", requestId, {
        task_id: providerTaskId,
        status: submitResult.data.status,
      });
    } catch (submitErr) {
      // Falha após débito → estornar + marcar failed
      await service
        .from("generations")
        .update({
          status: "failed",
          error_message: submitErr instanceof Error ? submitErr.message : "Falha ao submeter task",
          updated_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      await refundCredits(service, user.id, generationId, cost, requestId);

      return NextResponse.json(
        { error: submitErr instanceof Error ? submitErr.message : "Erro ao submeter task à PiAPI" },
        { status: 502 }
      );
    }

    // ── Atualizar provider_task_id + lifecycle pending → processing ────────────
    await service
      .from("generations")
      .update({
        provider_task_id: providerTaskId,
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    // ── Atualizar ugc_projects.segments ──────────────────────────────────────
    const currentSegments =
      (project.segments as Record<string, unknown> | null) ?? {};

    const updatedSegments = {
      ...currentSegments,
      [segKey]: {
        key: segKey,
        generation_id: generationId,
        status: "processing",
        text: speechText,
        duration: dur,
        resolution: resLower,
        format: formatValue,
        accent,
        camera_angles,
        // P10a — a cobrança segue a duração REAL do áudio (não `duration`).
        measured_seconds: billedSeconds,
        mode: avatarMode,
        cost,
        // v1: product_image_url é guardado mas não usado na composição
        ...(product_image_url ? { product_image_url } : {}),
        created_at: new Date().toISOString(),
      },
    };

    await service
      .from("ugc_projects")
      .update({
        segments: updatedSegments,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    auditLog("api.ugc.segment", "concluido", requestId, {
      project_id: projectId,
      segment_key: segKey,
      generation_id: generationId,
      provider_task_id: providerTaskId,
      cost,
    }, Date.now() - t0);

    return NextResponse.json({
      generation_id: generationId,
      provider_task_id: providerTaskId,
      cost,
      measured_seconds: billedSeconds,
      mode: avatarMode,
      status: "processing",
    });
  } catch (err) {
    console.error("[api/ugc/segment] Error:", err);
    auditLog("api.ugc.segment", "excecao_500", requestId, {
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
