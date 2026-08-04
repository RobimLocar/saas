import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { buildVideoPayload, submitVideoTask } from "@/lib/piapi/client";
import type { VideoModelParams } from "@/lib/piapi/client";
import { isSafeMediaUrl } from "@/lib/validate-generation";
import { auditLog, newRequestId } from "@/lib/audit-log";

type BrollClip = {
  preset: string;
  label: string;
  generation_id: string;
  status: "processing" | "completed" | "failed";
  duration: number;
  audio: boolean;
  created_at: string;
  result_url?: string;
  product_image_url?: string;
};

function normalizeBroll(input: unknown): BrollClip[] {
  return Array.isArray(input) ? (input as BrollClip[]) : [];
}

function pickSeedanceFastModel(models: Array<Record<string, unknown>>) {
  const byModelId = models.find((m) => m.model_id === "seedance-2.0-fast");
  if (byModelId) return byModelId;

  const byName = models.find((m) => {
    const name = typeof m.name === "string" ? m.name.toLowerCase() : "";
    return name.includes("seedance") && name.includes("fast");
  });
  if (byName) return byName;

  const byParams = models.find((m) => {
    const params = (m.params as Record<string, unknown> | null) || {};
    const backend = typeof params.backend === "string" ? params.backend : "";
    const taskType = typeof params.task_type === "string" ? params.task_type : "";
    return backend === "seedance" && taskType.includes("fast");
  });
  if (byParams) return byParams;

  return models.find((m) => {
    const params = (m.params as Record<string, unknown> | null) || {};
    return params.backend === "seedance";
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = newRequestId();
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
    const productImageUrl =
      typeof body?.product_image_url === "string" ? body.product_image_url.trim() : "";
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const referenceExtrasRaw: unknown[] = Array.isArray(body?.reference_images)
      ? body.reference_images
      : [];
    const referenceAudiosRaw: unknown[] = Array.isArray(body?.reference_audios)
      ? body.reference_audios
      : [];
    const aspectRatio =
      typeof body?.aspect_ratio === "string" && body.aspect_ratio.trim()
        ? body.aspect_ratio.trim()
        : "9:16";
    const resolution =
      typeof body?.resolution === "string" && body.resolution.trim()
        ? body.resolution.trim()
        : "720p";
    const durationRaw = Number(body?.duration);
    const duration = Number.isFinite(durationRaw) ? Math.round(durationRaw) : 8;
    const audio = Boolean(body?.audio);

    if (!productImageUrl || !isSafeMediaUrl(productImageUrl)) {
      return NextResponse.json({ error: "product_image_url inválida" }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "Descreva seu vídeo (prompt) antes de gerar." },
        { status: 400 }
      );
    }

    if (duration < 4 || duration > 15) {
      return NextResponse.json({ error: "duration deve estar entre 4 e 15" }, { status: 400 });
    }

    // Produto (obrigatório) + Interno + Avatar (opcionais); só URLs seguras, sem duplicar.
    const referenceImages = Array.from(
      new Set(
        [productImageUrl, ...referenceExtrasRaw]
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
          .map((u) => u.trim())
          .filter((u) => isSafeMediaUrl(u))
      )
    );
    const referenceAudios = Array.from(
      new Set(
        referenceAudiosRaw
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
          .map((u) => u.trim())
          .filter((u) => isSafeMediaUrl(u))
      )
    );

    const { data: project, error: projectErr } = await supabase
      .from("ugc_projects")
      .select("id, user_id, broll")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    const { data: profile } = await service
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    const { data: videoModels, error: modelErr } = await service
      .from("ai_models")
      .select("id, name, model_id, credit_cost, params")
      .eq("type", "video")
      .eq("is_active", true);

    if (modelErr || !videoModels || videoModels.length === 0) {
      return NextResponse.json({ error: "Modelos de vídeo indisponíveis" }, { status: 500 });
    }

    const selectedModel = pickSeedanceFastModel(videoModels as Array<Record<string, unknown>>);

    if (!selectedModel) {
      return NextResponse.json({ error: "Modelo Seedance não encontrado" }, { status: 404 });
    }

    const baseCost = Number(selectedModel.credit_cost || 0);
    const unitCost = effectiveCost(baseCost, profile?.plan ?? "free");
    const totalCost = unitCost;
    const available = profile?.credits_balance ?? 0;

    if (available < totalCost) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: totalCost,
          available,
        },
        { status: 402 }
      );
    }

    auditLog("api.ugc.broll", "precheck_ok", requestId, {
      project_id: projectId,
      prompt_preview: prompt.slice(0, 80),
      unit_cost: unitCost,
      total_cost: totalCost,
      available,
      model_id: selectedModel.model_id,
    });

    const modelParams = ((selectedModel.params as Record<string, unknown> | null) || {}) as VideoModelParams;
    const seedanceParams: VideoModelParams = {
      ...modelParams,
      backend: "seedance",
      task_type:
        typeof modelParams.task_type === "string" && modelParams.task_type.includes("fast")
          ? modelParams.task_type
          : "seedance-2-fast",
      seedance_tier:
        modelParams.seedance_tier === "fast" || modelParams.task_type === "seedance-2-fast"
          ? "fast"
          : modelParams.seedance_tier,
    };

    const currentBroll = normalizeBroll(project.broll);
    const clips: BrollClip[] = [];

    const generationId = randomUUID();

    const debit = await debitCredits(service, user.id, unitCost, generationId, requestId);
    if (!debit.ok) {
      if ("insufficient" in debit && debit.insufficient) {
        return NextResponse.json(
          { error: "Insufficient credits", required: unitCost, available: 0 },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: "Falha ao debitar créditos" }, { status: 500 });
    }

    try {
      const generationParams = {
        prompt,
        product_image_url: productImageUrl,
        reference_images: referenceImages,
        reference_audios: referenceAudios,
        aspect_ratio: aspectRatio,
        resolution,
        duration,
        audio,
      };

      const { error: genInsertErr } = await service.from("generations").insert({
        id: generationId,
        user_id: user.id,
        model_id: selectedModel.id,
        type: "video",
        prompt,
        params: generationParams,
        status: "processing",
        credits_used: unitCost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (genInsertErr) {
        throw new Error(`Erro ao inserir generation: ${genInsertErr.message}`);
      }

      const payload = buildVideoPayload({
        params: seedanceParams,
        prompt,
        quality: "medium",
        duration,
        imageUrl: productImageUrl,
        referenceImages,
        referenceAudios: referenceAudios.length ? referenceAudios : undefined,
        withAudio: audio,
        aspectRatio,
        resolution,
        requestId,
      });

      const submit = await submitVideoTask(payload, requestId);
      const providerTaskId = submit?.data?.task_id;
      if (!providerTaskId) {
        throw new Error("Provider task id ausente na resposta da PiAPI");
      }

      await service
        .from("generations")
        .update({ provider_task_id: providerTaskId, status: "processing", updated_at: new Date().toISOString() })
        .eq("id", generationId);

      const clip: BrollClip = {
        preset: "custom",
        label: "Vídeo UGC",
        generation_id: generationId,
        status: "processing",
        duration,
        audio,
        product_image_url: productImageUrl,
        created_at: new Date().toISOString(),
      };

      currentBroll.push(clip);

      await service
        .from("ugc_projects")
        .update({ broll: currentBroll, updated_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("user_id", user.id);

      clips.push(clip);
    } catch (loopErr) {
      await refundCredits(service, user.id, generationId, unitCost, requestId);
      await service
        .from("generations")
        .update({
          status: "failed",
          error_message: loopErr instanceof Error ? loopErr.message : "Falha no pipeline UGC",
          updated_at: new Date().toISOString(),
        })
        .eq("id", generationId);
    }

    if (clips.length === 0) {
      return NextResponse.json(
        { error: "Nenhum clipe foi iniciado. Tente novamente." },
        { status: 502 }
      );
    }

    return NextResponse.json({ clips });
  } catch (err) {
    console.error("[api/ugc/projects/:id/broll][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
