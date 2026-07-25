import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildVideoPayload, submitVideoTask } from "@/lib/piapi/client";
import type { VideoModelParams } from "@/lib/piapi/client";
import { planAllows } from "@/lib/plans";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      prompt,
      model_uuid,
      negative_prompt,
      aspect_ratio,
      duration,
      resolution,
      start_image_url,
      end_image_url,
      reference_images,
      reference_videos,
      reference_audios,
      shots,
      with_audio,
      quality,
    } = body;
    const qualityLevel: "low" | "medium" | "high" =
      quality === "low" || quality === "medium" ? quality : "high";

    if (!prompt || !model_uuid) {
      return NextResponse.json(
        { error: "Prompt e modelo são obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar modelo pelo identificador do provider (ai_models.model_id)
    const { data: aiModel } = await supabase
      .from("ai_models")
      .select("*")
      .eq("id", model_uuid)
      .eq("is_active", true)
      .single();

    if (!aiModel) {
      return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 });
    }

    // Verificar créditos e plano
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits_balance < aiModel.credit_cost) {
      return NextResponse.json(
        { error: "Créditos insuficientes", required: aiModel.credit_cost, available: profile?.credits_balance || 0 },
        { status: 402 }
      );
    }

    // Gating por plano mínimo do modelo
    if (!planAllows(profile.plan, aiModel.min_plan)) {
      return NextResponse.json(
        { error: `Este modelo requer o plano ${aiModel.min_plan}` },
        { status: 403 }
      );
    }

    // Deduzir créditos
    const newBalance = profile.credits_balance - aiModel.credit_cost;
    await supabase
      .from("profiles")
      .update({ credits_balance: newBalance })
      .eq("id", user.id);

    // Params de roteamento do modelo (backend/task_type/output_key/dur)
    const modelParams = (aiModel.params as VideoModelParams) || {};
    // A rota de status precisa do output_key para extrair a URL certa da PiAPI.
    const outputKey = modelParams.output_key || "output.video_url";

    // Criar geração — guardamos o output_key nos params da geração
    const { data: generation } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        model_id: aiModel.id,
        type: "video",
        prompt,
        negative_prompt,
        params: {
          aspect_ratio,
          duration,
          resolution,
          start_image_url,
          end_image_url,
          reference_images: Array.isArray(reference_images) ? reference_images : undefined,
          reference_videos,
          reference_audios,
          shots: Array.isArray(shots) ? shots : undefined,
          quality: qualityLevel,
          output_key: outputKey,
        },
        status: "pending",
        credits_used: aiModel.credit_cost,
      })
      .select()
      .single();

    if (!generation) {
      await supabase.from("profiles").update({ credits_balance: profile.credits_balance }).eq("id", user.id);
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
    }

    // Ledger de créditos
    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -aiModel.credit_cost,
      reason: "generation",
      related_job_id: generation.id,
    });

    // Chamar PiAPI
    try {
      // Monta o payload correto por backend (kling/kling-turbo/seedance/Wan/
      // hailuo/veo3/veo3.1) conforme os docs oficiais da PiAPI.
      const payload = buildVideoPayload({
        params: modelParams,
        prompt,
        quality: qualityLevel,
        duration: typeof duration === "number" ? duration : undefined,
        aspectRatio: aspect_ratio,
        imageUrl: start_image_url,
        endImageUrl: end_image_url,
        referenceImages: Array.isArray(reference_images) ? reference_images : undefined,
        referenceVideos: Array.isArray(reference_videos) ? reference_videos : undefined,
        referenceAudios: Array.isArray(reference_audios) ? reference_audios : undefined,
        shots: Array.isArray(shots) ? shots : undefined,
        withAudio: typeof with_audio === "boolean" ? with_audio : undefined,
        negativePrompt: negative_prompt,
      });

      console.log(
        `[generate/video] model=${aiModel.name} backend=${modelParams.backend} ` +
          `task_type=${payload.task_type} output_key=${outputKey} ` +
          `duration=${duration} aspect=${aspect_ratio} has_start_img=${!!start_image_url}`
      );

      const task = await submitVideoTask(payload);

      await supabase
        .from("generations")
        .update({ provider_task_id: task.data.task_id, status: "processing" })
        .eq("id", generation.id);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: task.data.task_id,
        credits_used: aiModel.credit_cost,
        balance: newBalance,
      });
    } catch (apiError) {
      // Reverter créditos
      await supabase.from("profiles").update({ credits_balance: profile.credits_balance }).eq("id", user.id);
      await supabase.from("generations").update({ status: "failed", error_message: String(apiError) }).eq("id", generation.id);
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: aiModel.credit_cost,
        reason: "refund",
        related_job_id: generation.id,
      });

      // Propaga o erro real da PiAPI para o frontend (ex.: "insufficient credits").
      const errMsg =
        apiError instanceof Error ? apiError.message : String(apiError);
      const isInsufficientCredits =
        errMsg.toLowerCase().includes("insufficient credits") ||
        errMsg.toLowerCase().includes("freeze credit") ||
        errMsg.toLowerCase().includes("quota not enough") ||
        errMsg.toLowerCase().includes("account point");
      const status = isInsufficientCredits ? 402 : 502;
      return NextResponse.json({ error: errMsg }, { status });
    }
  } catch (err) {
    console.error("[generate/video] Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
