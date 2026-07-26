import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSpeechAtlas, AtlasError } from "@/lib/atlas/client";
import {
  buildVideoPayload,
  submitVideoTask,
} from "@/lib/piapi/client";
import type { VideoModelParams } from "@/lib/piapi/client";
import { debitCredits, refundCredits } from "@/lib/credits";
import { mapAccentToVoice } from "@/lib/tts-voices";
import { isSafeMediaUrl } from "@/lib/validate-generation";
import { auditLog, newRequestId } from "@/lib/audit-log";
import { randomUUID } from "node:crypto";

/** Custo base por duração (seg): Math.ceil((14 + 3.75*d) * factor)
 * factor=1 (std: 720p), factor=2 (pro: 1080p/4k)
 * 8s/720p=44 | 8s/4k=88 */
function avatarSegmentCost(duration: number, resolution: "720p" | "1080p" | "4k"): number {
  const isPro = resolution === "1080p" || resolution === "4k";
  return Math.ceil((14 + 3.75 * duration) * (isPro ? 2 : 1));
}

const VALID_SEGMENT_KEYS = ["hook", "body1", "body2", "cta"] as const;
type SegmentKey = (typeof VALID_SEGMENT_KEYS)[number];

const VALID_DURATIONS = [4, 6, 8] as const;
const VALID_RESOLUTIONS = ["720p", "1080p", "4k"] as const;

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

    // product_image_url: aceitar e validar URL, mas NÃO usar na geração (v1)
    if (product_image_url && typeof product_image_url === "string") {
      if (!isSafeMediaUrl(product_image_url)) {
        return NextResponse.json({ error: "product_image_url inválida ou insegura" }, { status: 400 });
      }
    }

    auditLog("api.ugc.segment", "entrada", requestId, {
      user_id: user.id,
      project_id: projectId,
      segment_key: segKey,
      text_len: speechText.length,
      duration: dur,
      resolution: resLower,
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

    const avatarImageUrl = typeof project.avatar_image_url === "string"
      ? project.avatar_image_url.trim()
      : "";

    if (!avatarImageUrl || !isSafeMediaUrl(avatarImageUrl)) {
      return NextResponse.json(
        { error: "O projeto não tem um retrato de avatar definido. Faça upload de uma imagem primeiro." },
        { status: 400 }
      );
    }

    // ── Calcular custo ────────────────────────────────────────────────────────
    const { data: profile } = await service
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .single();

    const cost = avatarSegmentCost(dur, resLower as "720p" | "1080p" | "4k");
    const balance = profile?.credits_balance ?? 0;

    if (balance < cost) {
      return NextResponse.json(
        { error: "Créditos insuficientes", required: cost, available: balance },
        { status: 402 }
      );
    }

    // ── Buscar modelo kling-avatar ────────────────────────────────────────────
    const { data: aiModel } = await supabase
      .from("ai_models")
      .select("id, credit_cost, params")
      .eq("model_id", "kling-avatar")
      .eq("is_active", true)
      .single();

    if (!aiModel) {
      return NextResponse.json({ error: "Modelo Kling Avatar não disponível" }, { status: 404 });
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

    // ── Débito atômico ────────────────────────────────────────────────────────
    const generationId = randomUUID();

    const debit = await debitCredits(service, user.id, cost, generationId, requestId);
    if (!debit.ok) {
      if ("insufficient" in debit && debit.insufficient) {
        return NextResponse.json(
          { error: "Créditos insuficientes (race condition)", required: cost },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: "Erro ao debitar créditos" }, { status: 500 });
    }

    // ── INSERT na tabela generations ──────────────────────────────────────────
    const modelParams = (aiModel.params as VideoModelParams) ?? {};
    const generationParams = {
      ...modelParams,
      output_key: "output.video",
      segment_key: segKey,
      duration: dur,
      resolution: resLower,
      accent,
      voice_id: voiceId,
      camera_angles,
      avatar_image_url: avatarImageUrl,
      audio_url: audioPublicUrl,
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
        status: "processing",
        credits_used: cost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (genInsertErr) {
      // Rollback do débito se INSERT falhou
      await refundCredits(service, user.id, generationId, cost, requestId);
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
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

    // ── Atualizar provider_task_id na generation ──────────────────────────────
    await service
      .from("generations")
      .update({
        provider_task_id: providerTaskId,
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
        accent,
        camera_angles,
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
