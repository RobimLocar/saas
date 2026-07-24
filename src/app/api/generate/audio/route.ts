import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateAudio } from "@/lib/piapi/client";
import { generateSpeechAbacus } from "@/lib/abacus/client";
import { resolveOpenAiVoice } from "@/lib/tts-voices";
import { planAllows } from "@/lib/plans";

// Persiste um MP3 (Buffer) no Supabase Storage e retorna a URL pública.
async function persistAudio(
  userId: string,
  generationId: string,
  buffer: Buffer
): Promise<string> {
  const service = createServiceClient();
  const storagePath = `${userId}/audio/${generationId}.mp3`;
  const { error } = await service.storage
    .from("assets")
    .upload(storagePath, buffer, { contentType: "audio/mpeg", upsert: true });
  if (error) throw new Error(error.message);
  const { data } = service.storage.from("assets").getPublicUrl(storagePath);
  return data.publicUrl;
}

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
      duration,
      voice_id,
      language,
      quality,
      stability,
      similarity,
      speed,
    } = body;
    const qualityLevel: "low" | "medium" | "high" =
      quality === "low" || quality === "medium" ? quality : "high";
    // Normaliza os parâmetros de voz (0–1 para stability/similarity, 0.1–4 speed)
    const clamp = (n: unknown, lo: number, hi: number, dflt: number) =>
      typeof n === "number" && !Number.isNaN(n)
        ? Math.min(hi, Math.max(lo, n))
        : dflt;
    const stabilityVal = clamp(stability, 0, 1, 0.3);
    const similarityVal = clamp(similarity, 0, 1, 0.33);
    const speedVal = clamp(speed, 0.1, 4, 1);

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

    // Criar geração
    const { data: generation } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        model_id: aiModel.id,
        type: "audio",
        prompt,
        params: {
          duration,
          voice_id,
          language,
          quality: qualityLevel,
          stability: stabilityVal,
          similarity: similarityVal,
          speed: speedVal,
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

    try {
      const modelParams = (aiModel.params as Record<string, string>) || {};
      const backend = modelParams.backend || aiModel.model_id;

      // ── TTS (voz) — motor gpt-4o-audio da Abacus, SÍNCRONO ────────────────
      // A PiAPI não tem ElevenLabs; usamos o TTS do RouteLLM. A voz escolhida
      // muda o áudio de fato (mapeada para a voz OpenAI correspondente).
      if (backend === "abacus-tts" || modelParams.kind === "tts") {
        const voice = resolveOpenAiVoice(voice_id);
        const mp3 = await generateSpeechAbacus({
          text: prompt,
          voice,
          model: modelParams.tts_model || "gpt-4o-audio-preview",
        });
        const url = await persistAudio(user.id, generation.id, mp3);

        await supabase
          .from("generations")
          .update({
            status: "completed",
            result_url: url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        return NextResponse.json({
          generation_id: generation.id,
          status: "completed",
          result_url: url,
          credits_used: aiModel.credit_cost,
          balance: newBalance,
        });
      }

      // ── Música / SFX — PiAPI, assíncrono (polling) ────────────────────────
      const task = await generateAudio({
        model: backend,
        prompt,
        duration,
        quality: qualityLevel,
      });

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
      await supabase.from("profiles").update({ credits_balance: profile.credits_balance }).eq("id", user.id);
      await supabase.from("generations").update({ status: "failed", error_message: String(apiError) }).eq("id", generation.id);
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: aiModel.credit_cost,
        reason: "refund",
        related_job_id: generation.id,
      });

      return NextResponse.json({ error: "Erro ao chamar provedor de IA" }, { status: 502 });
    }
  } catch (err) {
    console.error("[generate/audio] Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
