import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateImage, generateImageGptSync } from "@/lib/piapi/client";
import { generateImageAbacus } from "@/lib/abacus/client";

// Cada modelo premium do catálogo → seu nome REAL no RouteLLM (Abacus).
// É por aqui que "Nano Banana Pro" volta a ser Nano Banana Pro de verdade
// (fusão multi-imagem), em vez de cair tudo no gpt-image-2.
const ABACUS_IMAGE_MODEL: Record<string, string> = {
  "gpt-image-2": "gpt_image2",
  "nano-banana": "nano_banana",
  "nano-banana-pro": "nano_banana_pro",
  "ideogram-v4-turbo": "ideogram",
};
import { planAllows } from "@/lib/plans";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { HIGH_COST_THRESHOLD_CREDITS, HIGH_COST_COOLDOWN_SECONDS } from "@/lib/constants";
import { auditLog, newRequestId } from "@/lib/audit-log";
import { validateGenerationInput } from "@/lib/validate-generation";
import { translateToEnglish } from "@/lib/translate";

// Heurística: o prompt pede TEXTO renderizado na imagem?
// (aspas, ou palavras típicas de tipografia/rótulos)
function promptWantsText(prompt: string): boolean {
  if (/["“”'']/.test(prompt)) return true;
  return /\b(text|reading|headline|label|badge|logo|typography|slogan|title|caption|lettering|sign|poster|escrito|texto|letreiro|r[óo]tulo)\b/i.test(
    prompt
  );
}

// Reforço tipográfico p/ backends Flux (renderizam texto mal sem instrução)
const TYPO_BOOST =
  " Render all text with perfect, crisp, legible typography — exact spelling, clean sans-serif lettering, no garbled or distorted characters, professional graphic design quality.";

// Persiste a imagem gerada (URL http ou data-URL) no Supabase Storage e
// retorna a URL pública final.
async function persistImage(
  userId: string,
  generationId: string,
  sourceUrl: string
): Promise<string> {
  const service = createServiceClient();
  const storagePath = `${userId}/image/${generationId}.png`;

  let buffer: Buffer;
  let contentType = "image/png";
  if (sourceUrl.startsWith("data:")) {
    const [meta, b64] = sourceUrl.split(",");
    contentType = meta.slice(5, meta.indexOf(";")) || "image/png";
    buffer = Buffer.from(b64, "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    contentType = res.headers.get("content-type") || "image/png";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const { error } = await service.storage
    .from("assets")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  const { data } = service.storage.from("assets").getPublicUrl(storagePath);
  return data.publicUrl;
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
    const { prompt, model_uuid, negative_prompt, aspect_ratio, width, height, reference_image_url, reference_images, resolution, quality } = body;
    // Todas as referências anexadas (o dock pode mandar várias). Compat com o
    // campo singular antigo.
    const refs: string[] = Array.isArray(reference_images)
      ? reference_images.filter((u: unknown): u is string => typeof u === "string" && u.length > 0)
      : reference_image_url
        ? [reference_image_url as string]
        : [];
    const qualityLevel: "low" | "medium" | "high" =
      quality === "low" || quality === "medium" ? quality : "high";

    // Validação local anti-SSRF/entrada (antes de qualquer DB ou débito)
    const inputValidation = validateGenerationInput({
      aspect_ratio,
      reference_image_url,
      reference_images,
    });
    if (!inputValidation.ok) {
      auditLog("api.generate.image", "validacao_local_400", requestId, {
        error: inputValidation.error,
      });
      return NextResponse.json({ error: inputValidation.error }, { status: 400 });
    }

    if (!prompt || !model_uuid) {
      return NextResponse.json(
        { error: "Prompt e modelo são obrigatórios" },
        { status: 400 }
      );
    }

    // Prompt sempre em inglês para a IA (best-effort).
    const promptEn = await translateToEnglish(
      typeof prompt === "string" ? prompt : ""
    );

    // Buscar modelo pelo identificador do provider (ai_models.model_id)
    const { data: aiModel, error: modelError } = await supabase
      .from("ai_models")
      .select("*")
      .eq("id", model_uuid)
      .eq("is_active", true)
      .single();

    if (modelError || !aiModel) {
      return NextResponse.json(
        { error: "Modelo não encontrado ou inativo" },
        { status: 404 }
      );
    }

    // Verificar créditos e plano do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    const cost = effectiveCost(aiModel.credit_cost, profile?.plan ?? "free");

    if (!profile || profile.credits_balance < cost) {
      return NextResponse.json(
        { error: "Créditos insuficientes", required: cost, available: profile?.credits_balance || 0 },
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
          auditLog("api.generate.image", "cooldown_bloqueado", requestId, {
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

    // Criar registro de geração
    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        model_id: aiModel.id,
        type: "image",
        prompt: promptEn,
        negative_prompt,
        // resolution (1K/2K/4K) é salvo apenas como rótulo para exibição;
        // as dimensões reais respeitam o limite de ~1MP do Flux (AR_DIMS).
        params: { aspect_ratio, width, height, reference_image_url, reference_images: refs, resolution: resolution || null, quality: qualityLevel },
        status: "pending",
        credits_used: cost,
      })
      .select()
      .single();

    if (genError || !generation) {
      return NextResponse.json(
        { error: "Erro ao registrar geração" },
        { status: 500 }
      );
    }

    const debitResult = await debitCredits(service, user.id, cost, generation.id, requestId);
    if (!debitResult.ok) {
      await service
        .from("generations")
        .update({ status: "failed", error_message: "Falha ao debitar créditos" })
        .eq("id", generation.id);

      if ("insufficient" in debitResult) {
        return NextResponse.json(
          { error: "Créditos insuficientes", required: cost, available: 0 },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: debitResult.error }, { status: 500 });
    }

    const newBalance = debitResult.balance;

    // Mapear proporção -> dimensões (Flux usa width/height)
    const AR_DIMS: Record<string, { w: number; h: number }> = {
      "1:1": { w: 1024, h: 1024 },
      "3:4": { w: 896, h: 1152 },
      "9:16": { w: 768, h: 1344 },
      "4:3": { w: 1152, h: 896 },
      "3:2": { w: 1216, h: 832 },
      "16:9": { w: 1344, h: 768 },
    };
    const dims = aspect_ratio ? AR_DIMS[aspect_ratio] : undefined;

    // Chamar o provedor
    try {
      const modelParams = (aiModel.params as Record<string, string>) || {};

      // ── GPT Image 2 (PiAPI, síncrono) — modelos premium (GPT Image 2,
      // Nano Banana, Nano Banana Pro, Ideogram) e qualquer geração com
      // quality "high" sem imagem de referência. Texto renderizado perfeito.
      const isPremium =
        modelParams.provider === "gpt-image" ||
        modelParams.provider === "abacus"; // compat com mapeamento antigo
      // Premium: usa GPT Image 2 sempre (suporta referência via campo "image").
      // Não-premium com qualidade alta e sem referência: também usa GPT.
      // Não-premium com referência: usa Flux img2img.
      const useGptSync = isPremium || (refs.length === 0 && qualityLevel === "high");
      if (useGptSync) {
        // Provider real por modelo (Nano Banana Pro / Nano Banana / Ideogram /
        // GPT Image 2) via RouteLLM — funde TODAS as referências. Se o RouteLLM
        // não estiver disponível, cai no gpt-image-2 da PiAPI (1 referência).
        const abacusModel = ABACUS_IMAGE_MODEL[aiModel.model_id] || "gpt_image2";
        let imageUrl: string;
        try {
          imageUrl = await generateImageAbacus({
            model: abacusModel,
            prompt: promptEn,
            aspect_ratio,
            quality: qualityLevel,
            reference_image_urls: refs,
          });
        } catch (abacusErr) {
          console.warn(
            "[generate/image] RouteLLM falhou, fallback gpt-image-2:",
            abacusErr
          );
          imageUrl = await generateImageGptSync({
            prompt: promptEn,
            aspect_ratio,
            quality: qualityLevel,
            reference_image_url: refs[0] || undefined,
          });
        }

        let finalUrl = imageUrl;
        try {
          finalUrl = await persistImage(user.id, generation.id, imageUrl);
        } catch (persistErr) {
          console.warn("[generate/image] persistImage falhou, usando URL do provider:", persistErr);
          // data-URL gigante não deve ir para o DB — nesse caso é erro real
          if (imageUrl.startsWith("data:")) throw persistErr;
        }

        await supabase
          .from("generations")
          .update({
            status: "completed",
            result_url: finalUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        return NextResponse.json({
          generation_id: generation.id,
          status: "completed",
          result_url: finalUrl,
          credits_used: cost,
          balance: newBalance,
        });
      }

      // ── Provider PiAPI (Flux) ────────────────────────────────────────────
      // Quality: low → flux1-schnell (rápido), medium/high → flux1-dev.
      const configuredBackend = modelParams.backend || aiModel.model_id;
      const isFluxBackend = configuredBackend.startsWith("Qubico/flux");
      const effectiveBackend = isFluxBackend
        ? qualityLevel === "low"
          ? "Qubico/flux1-schnell"
          : "Qubico/flux1-dev"
        : configuredBackend;

      // Reforço tipográfico: Flux renderiza texto mal — reforçar quando o
      // prompt pede texto (é o que dá o acabamento "alto nível")
      const effectivePrompt =
        isFluxBackend && promptWantsText(promptEn) ? promptEn + TYPO_BOOST : promptEn;

      const task = await generateImage({
        model: effectiveBackend,
        prompt: effectivePrompt,
        negative_prompt,
        aspect_ratio,
        width: width || dims?.w,
        height: height || dims?.h,
        reference_image_url: refs[0] || undefined,
      });

      // Atualizar geração com task_id
      await supabase
        .from("generations")
        .update({
          provider_task_id: task.data.task_id,
          status: "processing",
        })
        .eq("id", generation.id);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: task.data.task_id,
        credits_used: cost,
        balance: newBalance,
      });
    } catch (apiError) {
      console.error("[PiAPI] Erro detalhado:", apiError);
      
      await refundCredits(service, user.id, generation.id, cost, requestId);

      await service
        .from("generations")
        .update({ status: "failed", error_message: String(apiError) })
        .eq("id", generation.id);

      return NextResponse.json(
        { error: "Erro ao chamar provedor de IA", details: String(apiError) },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("[generate/image] Error:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
