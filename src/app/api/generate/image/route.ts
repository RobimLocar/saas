import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateImage, generateImageGptSync, generateImageGptEdits, submitGeminiImageTask, submitQwenImageTask } from "@/lib/piapi/client";

// Modelos da família Gemini / Nano Banana → API oficial Gemini da PiAPI
// (assíncrona, com fusão multi-imagem via input.image_urls). É o caminho certo
// para "trocar avatar" / combinar pessoa + produto numa imagem nova.
export const maxDuration = 300;

const GEMINI_TASK: Record<string, { taskType: string; resolution?: boolean; maxRefs?: number }> = {
  // ETAPA 7.6.3 — Nano Banana Pro aceita até 14 image_urls (schema oficial).
  "nano-banana-pro": { taskType: "nano-banana-pro", resolution: true, maxRefs: 14 },
  "nano-banana": { taskType: "gemini-2.5-flash-image", maxRefs: 6 },
};

// Qwen: largura/altura no máx. 1024 (doc oficial). Mapa por proporção.
const QWEN_DIMS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "9:16": { w: 576, h: 1024 },
  "3:4": { w: 768, h: 1024 },
  "2:3": { w: 680, h: 1024 },
  "16:9": { w: 1024, h: 576 },
  "4:3": { w: 1024, h: 768 },
  "3:2": { w: 1024, h: 680 },
};
import { planAllows } from "@/lib/plans";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { HIGH_COST_THRESHOLD_CREDITS, HIGH_COST_COOLDOWN_SECONDS } from "@/lib/constants";
import { auditLog, newRequestId } from "@/lib/audit-log";
import { validateGenerationInput } from "@/lib/validate-generation";
import { imageResolutionOptions, isImageResolutionSupported } from "@/lib/models/image-resolutions";
import { gptImage2RawCredits, GPT_IMAGE_2_MAX_REFS } from "@/lib/models/gpt-image-pricing";
import { translateToEnglish } from "@/lib/translate";
import { claimFreeImageTrial, releaseFreeImageTrial } from "@/lib/trials";
import { isAtlasRuntime, submitAtlasGeneration } from "@/lib/atlas/dispatch";
import { getAtlasContract } from "@/lib/atlas/profiles";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * GROWTH-02 — Caminho do TESTE GRÁTIS (1 imagem global por e-mail).
 * Auto-contido: claim atômico ANTES do provider, modelo SEMPRE server-controlled
 * (nano-banana → gemini / gemini-2.5-flash-image), credits_used = 0, 1 output PNG.
 * Falha no submit → devolve o trial (CLAIMED→AVAILABLE). O USED permanente e o
 * release em falha/timeout tardios ocorrem na rota de status (via generation_id).
 */
async function tryFreeImageTrial(args: {
  service: SupabaseClient;
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  requestId: string;
  promptEn: string;
  aspect_ratio: string | undefined;
  refs: string[];
}): Promise<NextResponse> {
  const { service, supabase, user, requestId, promptEn, aspect_ratio, refs } = args;

  // Modelo server-controlled: NUNCA confiar no model_uuid do browser para o trial.
  const { data: nano } = await service
    .from("ai_models")
    .select("id, model_id")
    .eq("model_id", "nano-banana")
    .eq("is_active", true)
    .single();
  if (!nano) {
    return NextResponse.json(
      { error: "Recarregue créditos para continuar criando.", recharge: true },
      { status: 402 }
    );
  }

  // ID pré-alocado = o que será claimado (permite claim ANTES do insert).
  const generationId = randomUUID();

  // CLAIM ATÔMICO antes de qualquer chamada de provider.
  const claim = await claimFreeImageTrial(service, user.email, user.id, generationId);
  if (!claim.claimed) {
    return NextResponse.json(
      {
        error: "Você já utilizou sua imagem grátis. Recarregue créditos para continuar criando.",
        trial: "used",
        recharge: true,
      },
      { status: 402 }
    );
  }

  const geminiCfg = GEMINI_TASK["nano-banana"];
  const trialRefs = refs.slice(0, geminiCfg.maxRefs ?? 6);

  const { error: genErr } = await supabase.from("generations").insert({
    id: generationId,
    user_id: user.id,
    model_id: nano.id,
    type: "image",
    prompt: promptEn,
    params: { aspect_ratio, reference_images: trialRefs, free_trial: true },
    status: "pending",
    credits_used: 0,
  });
  if (genErr) {
    await releaseFreeImageTrial(service, generationId); // devolve o trial
    return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
  }

  try {
    const task = await submitGeminiImageTask({
      taskType: geminiCfg.taskType,
      prompt: promptEn,
      imageUrls: trialRefs,
      aspectRatio: aspect_ratio,
      maxRefs: geminiCfg.maxRefs,
    });
    await supabase
      .from("generations")
      .update({ provider_task_id: task.data.task_id })
      .eq("id", generationId);
    auditLog("api.generate.image", "trial_submetido", requestId, {
      generation_id: generationId,
      user_id: user.id,
    });
    return NextResponse.json({
      generation_id: generationId,
      status: "pending",
      credits_used: 0,
      balance: 0,
      trial: "claimed",
      model_id: "nano-banana",
    });
  } catch (apiError) {
    // Submit falhou → devolve o trial e marca a geração como failed.
    await releaseFreeImageTrial(service, generationId);
    await service
      .from("generations")
      .update({ status: "failed", error_message: String(apiError) })
      .eq("id", generationId);
    return NextResponse.json(
      { error: "Erro ao chamar provedor de IA", details: String(apiError) },
      { status: 502 }
    );
  }
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
    const { prompt, model_uuid, negative_prompt, aspect_ratio, width, height, reference_image_url, reference_images, resolution, quality, seed, steps, flow_shift, guidance_scale } = body;
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

    // P9b — GPT Image 2 é o único SKU que roda o adapter GPT síncrono (params
    // .provider === "gpt-image" E não é Gemini/Nano nem Qwen). Só ELE recebe a
    // cobrança dinâmica (tamanho + refs). Nano Banana também tem provider "gpt-image"
    // mas roteia como Gemini (GEMINI_TASK) → billing flat, inalterado.
    // P11a — runtime Atlas explícito (opt-in via catálogo). Aditivo: modelos PiAPI
    // (sem runtime_provider) seguem 100% inalterados.
    const atlasParams = (aiModel.params as Record<string, unknown>) || {};
    const atlasRuntime = isAtlasRuntime(atlasParams);
    const atlasContract = atlasRuntime
      ? getAtlasContract(atlasParams.atlas_contract as string)
      : null;

    const gptParams = (aiModel.params as Record<string, unknown>) || {};
    const isGptImage =
      (gptParams.provider === "gpt-image" || gptParams.provider === "abacus") &&
      !GEMINI_TASK[aiModel.model_id] &&
      aiModel.model_id !== "qwen-image";

    // P9b — máx. 16 referências (contrato do provider). >16 → 400 ANTES de
    // insert/débito/provider (AUTORITATIVO na rota; nada de truncar em silêncio).
    if (isGptImage && refs.length > GPT_IMAGE_2_MAX_REFS) {
      auditLog("api.generate.image", "gpt_refs_excedidas_400", requestId, {
        model_id: aiModel.model_id,
        refs: refs.length,
        max: GPT_IMAGE_2_MAX_REFS,
      });
      return NextResponse.json(
        { error: `Máximo de ${GPT_IMAGE_2_MAX_REFS} imagens de referência para este modelo (recebidas: ${refs.length}).` },
        { status: 400 }
      );
    }

    // P9a — validação AUTORITATIVA de resolução ANTES de insert/débito/provider.
    // Uma resolução EXPLÍCITA não suportada pelo modelo (ex.: 2K/4K num modelo que
    // não seja Nano Banana Pro) é rejeitada — em vez de virar 1K em silêncio. Valores
    // ausentes/legado (sem escolha explícita) seguem o default do modelo.
    if (
      typeof resolution === "string" &&
      resolution &&
      !isImageResolutionSupported(aiModel.model_id, resolution)
    ) {
      auditLog("api.generate.image", "resolucao_invalida_400", requestId, {
        model_id: aiModel.model_id,
        resolution,
      });
      return NextResponse.json(
        {
          error: `Resolução ${resolution} não é suportada por este modelo. Opções: ${imageResolutionOptions(
            aiModel.model_id
          ).join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // Verificar créditos e plano do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    // ETAPA 7.6.1 — Nano Banana Pro cobra por RESOLUÇÃO (provider: $0.105 em 1K/2K,
    // $0.18 em 4K). Se o modelo tem `credit_cost_map`, usa o valor da resolução
    // escolhida; senão mantém o credit_cost flat. NUNCA cai em flat para 4K.
    // Só afeta modelos com o mapa (hoje: nano-banana-pro). Demais imagens: inalterados.
    let imageBaseCost = aiModel.credit_cost;
    if (isGptImage) {
      // P9b — GPT Image 2: raw = (square 4 / non-square 6) + 2 por referência.
      // O multiplicador de plano é aplicado UMA vez abaixo (effectiveCost).
      imageBaseCost = gptImage2RawCredits({
        aspectRatio: aspect_ratio,
        referenceCount: refs.length,
      });
    } else {
      const imgParams = (aiModel.params as Record<string, unknown> | null) || {};
      const ccMap = imgParams.credit_cost_map as Record<string, number> | undefined;
      if (ccMap && typeof ccMap === "object") {
        const resKey = resolution === "2K" || resolution === "4K" ? resolution : "1K";
        const mapped = ccMap[resKey];
        if (typeof mapped === "number" && mapped > 0) imageBaseCost = mapped;
        // resolução fora de {1K,2K,4K} → cai em "1K" (acima), nunca no flat p/ 4K.
      }
    }
    const cost = effectiveCost(imageBaseCost, profile?.plan ?? "free");

    // GROWTH-02 — Prioridade PAGA: com saldo suficiente segue o fluxo pago normal
    // com o modelo SELECIONADO e o trial é PRESERVADO. Sem saldo → tenta o teste
    // grátis (1 imagem global por e-mail, modelo server-controlled = Nano Banana).
    // Se o trial não estiver disponível, `tryFreeImageTrial` devolve 402 (recarga).
    const canPay = !!profile && profile.credits_balance >= cost;
    if (!canPay) {
      return await tryFreeImageTrial({
        service,
        supabase,
        user,
        requestId,
        promptEn,
        aspect_ratio,
        refs,
      });
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
        params: {
          aspect_ratio, width, height, reference_image_url, reference_images: refs,
          resolution: resolution || null, quality: qualityLevel,
          ...(atlasRuntime
            ? {
                runtime_provider: "atlas",
                atlas_contract: atlasParams.atlas_contract,
                atlas_output_kind: atlasContract?.outputKind ?? "media",
              }
            : {}),
        },
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
      // ── P11a — Atlas runtime (aditivo): profile → generateImage → prediction ──
      if (atlasRuntime) {
        const dispatch = await submitAtlasGeneration({
          contractId: atlasParams.atlas_contract as string,
          atlasModel: atlasParams.atlas_model as string,
          input: { prompt: promptEn, aspect_ratio, image_urls: refs },
        });
        if (!dispatch.ok || !dispatch.pollRef) {
          await refundCredits(service, user.id, generation.id, cost, requestId);
          await service
            .from("generations")
            .update({ status: "failed", error_message: dispatch.error || "Falha no provider Atlas" })
            .eq("id", generation.id);
          return NextResponse.json(
            { error: dispatch.error || "Erro ao chamar provedor Atlas" },
            { status: 502 }
          );
        }
        await supabase
          .from("generations")
          .update({ provider_task_id: dispatch.pollRef, status: "processing" })
          .eq("id", generation.id);
        return NextResponse.json({
          generation_id: generation.id,
          status: "processing",
          credits_used: cost,
          balance: newBalance,
        });
      }

      const modelParams = (aiModel.params as Record<string, string>) || {};

      // ── Nano Banana / Nano Banana Pro (API Gemini da PiAPI, assíncrono) ─────
      // Funde TODAS as referências (input.image_urls): troca de avatar, pessoa +
      // produto, edição multi-imagem. O polling (status route) lê output.image_urls.
      const geminiCfg = GEMINI_TASK[aiModel.model_id];
      if (geminiCfg) {
        const task = await submitGeminiImageTask({
          taskType: geminiCfg.taskType,
          prompt: promptEn,
          imageUrls: refs,
          aspectRatio: aspect_ratio,
          resolution: geminiCfg.resolution
            ? resolution === "2K" || resolution === "4K"
              ? resolution
              : "1K"
            : undefined,
          maxRefs: geminiCfg.maxRefs,
        });
        await supabase
          .from("generations")
          .update({ provider_task_id: task.data.task_id })
          .eq("id", generation.id);
        return NextResponse.json({
          generation_id: generation.id,
          status: "pending",
          credits_used: cost,
          balance: newBalance,
        });
      }

      // ── Qwen Image (PiAPI, assíncrono) — modelo real (txt2img / image-edit) ──
      if (aiModel.model_id === "qwen-image") {
        const qd = (aspect_ratio && QWEN_DIMS[aspect_ratio]) || { w: 1024, h: 1024 };
        const task = await submitQwenImageTask({
          prompt: promptEn,
          imageUrls: refs,
          negativePrompt: negative_prompt,
          width: qd.w,
          height: qd.h,
          // ETAPA 7.6.3 — schema oficial qwen-image (opcionais).
          steps: typeof steps === "number" ? steps : undefined,
          seed: typeof seed === "number" ? seed : undefined,
          flowShift: typeof flow_shift === "number" ? flow_shift : undefined,
        });
        await supabase
          .from("generations")
          .update({ provider_task_id: task.data.task_id })
          .eq("id", generation.id);
        return NextResponse.json({
          generation_id: generation.id,
          status: "pending",
          credits_used: cost,
          balance: newBalance,
        });
      }

      // ── GPT Image 2 (PiAPI, síncrono) — SOMENTE quando o modelo escolhido é
      // premium (params.provider === "gpt-image"). ETAPA 1 P0 (contract integrity):
      // a IDENTIDADE do modelo vem exclusivamente do model_uuid selecionado; nem
      // `quality` nem o número de referências podem trocar QUAL modelo executa.
      // Antes, `quality === "high"` sem referência e `refs.length >= 2` sequestravam
      // gerações Flux para o GPT Image 2 — isso está proibido. Flux/Qwen/Gemini
      // seguem seus próprios adapters abaixo.
      const isPremium =
        modelParams.provider === "gpt-image" ||
        modelParams.provider === "abacus"; // compat com mapeamento antigo
      // GPT Image edits (multi-imagem) só para o próprio GPT Image; GPT sync só
      // quando o modelo é premium. Nada aqui depende de `quality`.
      const useGptEdits = refs.length >= 1 && isPremium;
      const useGptSync = isPremium;
      if (useGptSync) {
        // DEV log seguro (sem segredos): confirma que só modelo premium roda GPT.
        console.log(
          "[generate/image] MODEL_CONTRACT",
          JSON.stringify({
            requested_model_uuid: model_uuid,
            requested_model_id: aiModel.model_id,
            quality: qualityLevel,
            refs: refs.length,
            route: useGptEdits ? "gpt-image-2/edits" : "gpt-image-2/sync",
            effective_provider_model: "gpt-image-2",
          })
        );
        const imageUrl = useGptEdits
          ? await generateImageGptEdits({
              prompt: promptEn,
              imageUrls: refs,
              aspect_ratio,
            })
          : await generateImageGptSync({
              prompt: promptEn,
              aspect_ratio,
              quality: qualityLevel,
              reference_image_url: refs[0] || undefined,
            });

        // P9a — DURABLE-OR-REFUND (invariante P8a estendida ao GPT síncrono):
        // `completed` exige uma URL DURÁVEL de Storage do Fluxyra. Se a persistência
        // falhar (b64 OU http), a geração vira `failed` + estorno (P7b idempotente)
        // — NUNCA `completed` com a URL temporária do provider (que pode ser apagada).
        let finalUrl: string;
        try {
          finalUrl = await persistImage(user.id, generation.id, imageUrl);
        } catch (persistErr) {
          console.warn("[generate/image] persistImage falhou → failed + estorno:", persistErr);
          await refundCredits(service, user.id, generation.id, cost, requestId);
          const errMsg =
            "Não foi possível salvar o resultado da geração. Seus créditos foram estornados.";
          await service
            .from("generations")
            .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
            .eq("id", generation.id);
          return NextResponse.json({
            generation_id: generation.id,
            status: "failed",
            error_message: errMsg,
            credits_used: 0,
            balance: newBalance + cost,
          });
        }

        // finalUrl é SEMPRE uma URL de Storage do Fluxyra (persistImage só retorna
        // a public URL do bucket; nunca a URL do provider).
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
      // ETAPA 1 P0 (contract integrity): o backend enviado ao provider vem do
      // modelo selecionado (params.backend, senão o model_id) — NUNCA de `quality`.
      // Antes, `quality === "high"` forçava qualquer Flux para flux1-dev, então
      // "Flux Schnell" executava flux1-dev. Agora Flux Schnell → flux1-schnell,
      // Flux Dev → flux1-dev. Obs.: "Flux 1.1 Pro" tem model_id `Qubico/flux1-pro`
      // que a PiAPI NÃO oferece (doc /flux-api/text-to-image lista apenas
      // flux1-dev, flux1-schnell, flux1-dev-advanced); o catálogo já aponta seu
      // backend para `Qubico/flux1-dev`, então roda um Flux real (ver relatório).
      const configuredBackend = modelParams.backend || aiModel.model_id;
      const isFluxBackend = configuredBackend.startsWith("Qubico/flux");
      const effectiveBackend = configuredBackend;

      // Reforço tipográfico: Flux renderiza texto mal — reforçar quando o
      // prompt pede texto (é o que dá o acabamento "alto nível")
      const effectivePrompt =
        isFluxBackend && promptWantsText(promptEn) ? promptEn + TYPO_BOOST : promptEn;

      // DEV log seguro (sem segredos): REQUESTED (modelo selecionado) vs
      // EFFECTIVE (modelo enviado ao provider). Ajuda a validar no deploy que
      // Flux Schnell → flux1-schnell etc. (Etapa 1 P0 — contract integrity.)
      console.log(
        "[generate/image] MODEL_CONTRACT",
        JSON.stringify({
          requested_model_uuid: model_uuid,
          requested_model_id: aiModel.model_id,
          quality: qualityLevel,
          refs: refs.length,
          route: "flux",
          effective_provider_model: effectiveBackend,
        })
      );

      const task = await generateImage({
        model: effectiveBackend,
        prompt: effectivePrompt,
        negative_prompt,
        aspect_ratio,
        width: width || dims?.w,
        height: height || dims?.h,
        reference_image_url: refs[0] || undefined,
        // ETAPA 7.6.3 — Flux guidance_scale (schema: 1.5–5). Opcional; sem seed/steps
        // (não existem no schema oficial do Flux txt2img/img2img).
        guidanceScale: typeof guidance_scale === "number" ? guidance_scale : undefined,
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
