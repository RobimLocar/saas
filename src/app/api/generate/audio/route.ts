import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateAudio } from "@/lib/piapi/client";
import { generateSpeechAtlas, AtlasError } from "@/lib/atlas/client";
import { resolveAtlasVoice } from "@/lib/tts-voices";
import { planAllows } from "@/lib/plans";
import { debitCredits, refundCredits } from "@/lib/credits";
import { HIGH_COST_THRESHOLD_CREDITS, HIGH_COST_COOLDOWN_SECONDS } from "@/lib/constants";
import { auditLog, newRequestId } from "@/lib/audit-log";

// Persiste um áudio (Buffer) no Supabase Storage e retorna a URL pública.
async function persistAudio(
  userId: string,
  generationId: string,
  buffer: Buffer,
  ext = "mp3",
  contentType = "audio/mpeg"
): Promise<string> {
  const service = createServiceClient();
  const storagePath = `${userId}/audio/${generationId}.${ext}`;
  const { error } = await service.storage
    .from("assets")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = service.storage.from("assets").getPublicUrl(storagePath);
  return data.publicUrl;
}

// Baixa a URL de saída do Atlas e a persiste no Storage (durabilidade + mesma
// origem). Retorna a URL pública final.
async function downloadAndPersist(
  userId: string,
  generationId: string,
  sourceUrl: string
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new AtlasError("Falha ao baixar o áudio gerado", 502);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const clean = sourceUrl.split("?")[0];
  const ext = clean.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
  const contentType = ext === "wav" ? "audio/wav" : "audio/mpeg";
  return persistAudio(userId, generationId, buffer, ext, contentType);
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
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

    // Cooldown de alto custo (§4, §6 — HIGH_COST_COOLDOWN_SECONDS)
    if (aiModel.credit_cost > HIGH_COST_THRESHOLD_CREDITS) {
      const { data: lastGen } = await service
        .from("generations")
        .select("created_at")
        .eq("user_id", user.id)
        .gt("credits_used", HIGH_COST_THRESHOLD_CREDITS)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (lastGen) {
        const elapsed = (Date.now() - new Date(lastGen.created_at).getTime()) / 1000;
        const retryAfter = Math.ceil(HIGH_COST_COOLDOWN_SECONDS - elapsed);
        if (retryAfter > 0) {
          auditLog("api.generate.audio", "cooldown_bloqueado", requestId, {
            user_id: user.id,
            elapsed_s: Math.round(elapsed),
            retry_after: retryAfter,
            model: aiModel.name,
            credit_cost: aiModel.credit_cost,
          });
          return NextResponse.json(
            {
              error: `Aguarde ${retryAfter} segundos entre gerações de alto custo`,
              retry_after: retryAfter,
            },
            { status: 429 }
          );
        }
      }
    }

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
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
    }

    const debitResult = await debitCredits(service, user.id, aiModel.credit_cost, generation.id, requestId);
    if (!debitResult.ok) {
      await service
        .from("generations")
        .update({ status: "failed", error_message: "Falha ao debitar créditos" })
        .eq("id", generation.id);

      if ("insufficient" in debitResult) {
        return NextResponse.json(
          { error: "Créditos insuficientes", required: aiModel.credit_cost, available: 0 },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: debitResult.error }, { status: 500 });
    }

    const newBalance = debitResult.balance;

    try {
      const modelParams = (aiModel.params as Record<string, string>) || {};
      const backend = modelParams.backend || aiModel.model_id;

      // ── TTS (voz) — Atlas Cloud (ElevenLabs v3) ───────────────────────────
      // A voz escolhida é aceita diretamente pelo Atlas; a saída é uma URL de
      // áudio que baixamos e persistimos no nosso Storage. O ElevenLabs v3 só
      // expõe `stability` (similarity/speed ficam salvos mas não têm efeito).
      if (backend === "atlas-tts" || modelParams.kind === "tts") {
        const audioUrl = await generateSpeechAtlas({
          text: prompt,
          voice: resolveAtlasVoice(voice_id),
          model: modelParams.atlas_model || "elevenlabs/v3/text-to-speech",
          stability: stabilityVal,
        });
        const url = await downloadAndPersist(user.id, generation.id, audioUrl);

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
      await refundCredits(service, user.id, generation.id, aiModel.credit_cost, requestId);
      await service.from("generations").update({ status: "failed", error_message: String(apiError) }).eq("id", generation.id);

      // Erros do Atlas trazem status/mensagem PT-BR prontos para o usuário
      // (ex.: 503 sem chave, 402 saldo insuficiente). Créditos já reembolsados.
      if (apiError instanceof AtlasError) {
        return NextResponse.json(
          { error: apiError.message },
          { status: apiError.status || 502 }
        );
      }
      return NextResponse.json({ error: "Erro ao chamar provedor de IA" }, { status: 502 });
    }
  } catch (err) {
    console.error("[generate/audio] Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
