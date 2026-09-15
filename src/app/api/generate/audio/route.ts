import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AtlasError } from "@/lib/atlas/client"; // mantido: catch usa instanceof AtlasError
import { getProvider } from "@/lib/providers/registry";
import type { GenTask } from "@/lib/providers/types";
import "@/lib/providers/register"; // bootstrap: registra piapi + atlas
import { resolveAtlasVoice } from "@/lib/tts-voices";
import { planAllows } from "@/lib/plans";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { HIGH_COST_THRESHOLD_CREDITS, HIGH_COST_COOLDOWN_SECONDS } from "@/lib/constants";
import { auditLog, newRequestId } from "@/lib/audit-log";
import { validateGenerationInput } from "@/lib/validate-generation";
import { translateToEnglish } from "@/lib/translate";
import { resolveAudioUISpec } from "@/lib/models/audio-ui-spec";
import {
  countTtsCharacters,
  calculateTtsBaseCredits,
  calculateTtsProviderListPriceUsd,
  isValidTtsPerKCharConfig,
  TTS_MAX_CHARACTERS,
} from "@/lib/billing/tts-pricing";

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
      // Udio (music-u) — P5e. Modo semântico da UI + campos avançados. Só
      // consumidos no branch music-u; ignorados por TTS/ACE-Step/SFX.
      music_mode,
      lyrics,
      negative_tags,
      seed,
      // ACE-Step Music (Qubico/ace-step, kind music) — P5f. negative_prompt
      // oficial. Consumido em ACE-Step Music e MMAudio; ignorado nos demais.
      negative_prompt,
      // MMAudio real (Qubico/mmaudio, video2audio) — P5h. URL pública do vídeo.
      // Só consumido no branch/profile MMAudio; ignorado nos demais.
      video_url,
    } = body;
    const qualityLevel: "low" | "medium" | "high" =
      quality === "low" || quality === "medium" ? quality : "high";

    // Validação local anti-SSRF/entrada (antes de qualquer DB ou débito)
    const inputValidation = validateGenerationInput({
      duration,
      reference_image_url: body.reference_image_url,
      reference_images: body.reference_images,
      reference_videos: body.reference_videos,
      reference_audios: body.reference_audios,
    });
    if (!inputValidation.ok) {
      auditLog("api.generate.audio", "validacao_local_400", requestId, {
        error: inputValidation.error,
      });
      return NextResponse.json({ error: inputValidation.error }, { status: 400 });
    }

    // Normaliza o parâmetro de voz (0–1 para stability). O ElevenLabs v3 do
    // Atlas só expõe `stability`; similarity/speed foram removidos (P5b) por não
    // existirem no contrato oficial atual.
    const clamp = (n: unknown, lo: number, hi: number, dflt: number) =>
      typeof n === "number" && !Number.isNaN(n)
        ? Math.min(hi, Math.max(lo, n))
        : dflt;
    const stabilityVal = clamp(stability, 0, 1, 0.3);

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

    // ── AudioUISpec: fonte semântica única (P5c) para validação model-specific ─
    // Resolve o profile a partir dos dados reais do catálogo (model_id/kind/backend).
    const aiModelParams = (aiModel.params as Record<string, unknown> | null) || {};
    const audioUiSpec = resolveAudioUISpec({
      modelId: aiModel.model_id,
      kind: typeof aiModelParams.kind === "string" ? aiModelParams.kind : null,
      backend: typeof aiModelParams.backend === "string" ? aiModelParams.backend : null,
    });

    // ── Validação de modo por spec (P5e-fix Udio + P5f ACE-Step Music) ────────
    // Só profiles COM modos (udio, ace-step-music) validam music_mode; TTS/SFX/
    // generic ignoram os campos, preservando o comportamento atual. Roda ANTES de
    // custo/insert/débito/provider. Modo ausente → "instrumental" (ambos os
    // profiles têm esse modo → backward compatibility). Modo explícito inválido →
    // 400. Se o modo atual torna o campo `lyrics` visível na spec (visibleWhen),
    // a letra é obrigatória (não-vazia) → 400 se ausente. IDs de modo válidos vêm
    // exclusivamente de audioUiSpec.modes (nunca hardcode paralelo).
    if (audioUiSpec.modes && audioUiSpec.modes.length > 0) {
      const validModeIds = audioUiSpec.modes.map((m) => m.id);
      const effectiveMode = music_mode === undefined ? "instrumental" : music_mode;
      if (!validModeIds.includes(effectiveMode)) {
        auditLog("api.generate.audio", "music_mode_invalido_400", requestId, {
          model_id: aiModel.model_id,
          profile: audioUiSpec.profile,
          music_mode: String(music_mode),
        });
        return NextResponse.json(
          { error: `Modo de música inválido: ${String(music_mode)}` },
          { status: 400 }
        );
      }
      const lyricsField = audioUiSpec.fields.find((f) => f.id === "lyrics");
      const lyricsRequiredNow = Boolean(
        lyricsField?.visibleWhen?.modes.includes(effectiveMode)
      );
      if (lyricsRequiredNow && !(typeof lyrics === "string" && lyrics.trim())) {
        return NextResponse.json(
          { error: "A letra (lyrics) é obrigatória neste modo." },
          { status: 400 }
        );
      }
    }

    // ── Validação Kling Sound SFX (P5g) ───────────────────────────────────────
    // Só o profile kling-sfx. Roda ANTES de custo/insert/débito/provider.
    //  • Contract mismatch: o profile resolveu Kling, mas o catálogo não é
    //    coerente (provider != piapi OU backend != kling) → 400 (evita repetir o
    //    antipadrão provider="atlas" + backend PiAPI). Não confia só no label.
    //  • duration é OBRIGATÓRIA e só aceita 5 ou 10 (numérico estrito; "5" string
    //    NÃO é coagida). Ausente/inválida → 400.
    if (audioUiSpec.profile === "kling-sfx") {
      const provider = typeof aiModel.provider === "string" ? aiModel.provider : "";
      const klingBackend = String(
        aiModelParams.backend ?? aiModel.model_id ?? ""
      ).toLowerCase();
      if (provider !== "piapi" || klingBackend !== "kling") {
        auditLog("api.generate.audio", "kling_contract_mismatch_400", requestId, {
          model_id: aiModel.model_id,
          provider,
          backend: klingBackend,
        });
        return NextResponse.json(
          { error: "Configuração do modelo inconsistente (Kling Sound)." },
          { status: 400 }
        );
      }
      if (duration !== 5 && duration !== 10) {
        return NextResponse.json(
          { error: "Duração inválida: escolha 5 ou 10 segundos." },
          { status: 400 }
        );
      }
    }

    // ── Validação MMAudio real (P5h) ──────────────────────────────────────────
    // Só o profile MMAudio (video2audio). Roda ANTES de custo/insert/débito/provider.
    //  • Contract mismatch: profile MMAudio mas catálogo incoerente (provider!=piapi
    //    OU backend!=Qubico/mmaudio) → 400 (evita provider errado; não confia no label).
    //  • video_url OBRIGATÓRIO e http(s) válido → 400.
    //  • prompt obrigatório (PRODUCT UX DECISION: não gerar sem direção) → 400 se vazio.
    if (audioUiSpec.profile === "mmaudio-video2audio") {
      const provider = typeof aiModel.provider === "string" ? aiModel.provider : "";
      const mmBackend = String(
        aiModelParams.backend ?? aiModel.model_id ?? ""
      ).toLowerCase();
      if (provider !== "piapi" || mmBackend !== "qubico/mmaudio") {
        auditLog("api.generate.audio", "mmaudio_contract_mismatch_400", requestId, {
          model_id: aiModel.model_id,
          provider,
          backend: mmBackend,
        });
        return NextResponse.json(
          { error: "Configuração do modelo inconsistente (MMAudio)." },
          { status: 400 }
        );
      }
      if (!(typeof video_url === "string" && /^https?:\/\//i.test(video_url))) {
        return NextResponse.json(
          { error: "Vídeo de origem obrigatório (URL válida)." },
          { status: 400 }
        );
      }
      if (!(typeof prompt === "string" && prompt.trim())) {
        return NextResponse.json(
          { error: "Descreva o áudio desejado (prompt obrigatório)." },
          { status: 400 }
        );
      }
    }

    // Verificar créditos e plano
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    // ── Custo (P5d1b) ─────────────────────────────────────────────────────────
    // TTS Atlas com billing por caractere (params.billing_mode = "per_kchar"):
    // custo dinâmico = effectiveCost( baseCreditsFromChars, plano ). O RATE
    // (base_credits_per_kchar) vem do CATÁLOGO, nunca hardcode aqui. Demais
    // modelos de áudio (música/SFX PiAPI) seguem o flat credit_cost.
    const planForCost = profile?.plan ?? "free";
    const audioParams = (aiModel.params as Record<string, unknown> | null) || {};
    const isPerKChar = audioParams.billing_mode === "per_kchar";

    let cost: number;
    let ttsMeta: Record<string, unknown> | null = null;
    if (isPerKChar) {
      const charCount = countTtsCharacters(prompt);
      // Limite oficial (5000) aplicado ANTES de insert/debit/provider.
      if (charCount > TTS_MAX_CHARACTERS) {
        return NextResponse.json(
          { error: `Texto muito longo: ${charCount}/${TTS_MAX_CHARACTERS} caracteres.` },
          { status: 400 }
        );
      }
      // Fail-closed: config de cobrança ausente/inválida NÃO cobra barato.
      if (!isValidTtsPerKCharConfig({ baseCreditsPerKChar: audioParams.base_credits_per_kchar })) {
        auditLog("api.generate.audio", "config_billing_invalida_503", requestId, {
          model_id: aiModel.model_id,
          base_credits_per_kchar: audioParams.base_credits_per_kchar,
        });
        return NextResponse.json(
          { error: "Configuração de cobrança do modelo indisponível. Tente novamente mais tarde." },
          { status: 503 }
        );
      }
      const rate = audioParams.base_credits_per_kchar as number;
      const baseCredits = calculateTtsBaseCredits(charCount, rate);
      cost = effectiveCost(baseCredits, planForCost);
      const providerPrice =
        typeof audioParams.provider_price_per_kchar_usd === "number"
          ? calculateTtsProviderListPriceUsd(charCount, audioParams.provider_price_per_kchar_usd)
          : undefined;
      ttsMeta = {
        character_count: charCount,
        base_credits: baseCredits,
        charged_credits: cost,
        pricing_version:
          typeof audioParams.pricing_version === "string" ? audioParams.pricing_version : null,
        ...(providerPrice !== undefined
          ? { provider_list_price_usd_estimate: providerPrice }
          : {}),
      };
    } else {
      cost = effectiveCost(aiModel.credit_cost, planForCost);
    }

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

    // Cooldown de alto custo (§4, §6 — HIGH_COST_COOLDOWN_SECONDS).
    // Para TTS per_kchar o custo é dinâmico → usa o custo calculado; demais
    // modelos preservam o comportamento atual (base credit_cost do catálogo).
    const cooldownCost = isPerKChar ? cost : aiModel.credit_cost;
    if (cooldownCost > HIGH_COST_THRESHOLD_CREDITS) {
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
          // P5d1b — metadata de auditoria financeira do TTS por caractere
          // (character_count, base_credits, charged_credits, pricing_version,
          // provider_list_price_usd_estimate). Ausente p/ música/SFX (flat).
          ...(ttsMeta ?? {}),
        },
        status: "pending",
        credits_used: cost,
      })
      .select()
      .single();

    if (!generation) {
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
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

    try {
      const modelParams = (aiModel.params as Record<string, string>) || {};
      const backend = modelParams.backend || aiModel.model_id;

      // ── TTS (voz) — Atlas Cloud (ElevenLabs v3) ───────────────────────────
      // A voz escolhida é aceita diretamente pelo Atlas; a saída é uma URL de
      // áudio que baixamos e persistimos no nosso Storage. O ElevenLabs v3 só
      // expõe `stability`.
      if (backend === "atlas-tts" || modelParams.kind === "tts") {
        // P4g — via Provider Registry → Atlas adapter → Atlas client (TTS).
        // Args idênticos ao anterior. A URL final vem de submission.providerTaskId
        // (o adapter encapsula o submit+poll SÍNCRONO do Atlas). Sem polling novo.
        const atlasModel = modelParams.atlas_model || "elevenlabs/v3/text-to-speech";
        const atlasTask = {
          canonicalId: aiModel.model_id,   // identidade canônica estável (catálogo)
          requestId,                       // correlação da execução (separada)
          type: "audio",
          providerModelId: atlasModel,
          input: {},
          params: {
            call: {
              text: prompt,
              voice: resolveAtlasVoice(voice_id),
              model: atlasModel,
              stability: stabilityVal,
            },
          },
        } satisfies GenTask;
        const submission = await getProvider("atlas").submit(atlasTask);
        const audioUrl = submission.providerTaskId;
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
          credits_used: cost,
          balance: newBalance,
        });
      }

      // ── Música / SFX — PiAPI, assíncrono (polling) ────────────────────────
      // Descrição de música/efeito → traduz para inglês (o TTS acima mantém o
      // idioma do usuário, pois lá o "prompt" é o texto que será FALADO).
      const promptEn = await translateToEnglish(
        typeof prompt === "string" ? prompt : ""
      );

      // P5e — Udio (music-u): 3 workflows oficiais mapeados a partir do modo
      // SEMÂNTICO da UI. gpt_description_prompt continua traduzido (é descrição
      // de estilo); a LETRA custom é do usuário e NÃO é traduzida. negative_tags
      // e seed são opcionais (avançado). ACE-Step/SFX seguem inalterados: os
      // campos abaixo só são anexados quando o backend é music-u.
      const udioArgs: {
        lyricsType?: "generate" | "instrumental" | "user";
        lyrics?: string;
        negativeTags?: string;
        seed?: number;
      } = {};
      if (audioUiSpec.profile === "udio") {
        const modeToLyricsType: Record<string, "generate" | "instrumental" | "user"> = {
          "ai-vocals": "generate",
          instrumental: "instrumental",
          "custom-lyrics": "user",
        };
        const mode = typeof music_mode === "string" ? music_mode : "instrumental";
        // Default de produto = instrumental (também o fallback para modo desconhecido
        // e para requests legados sem music_mode → paridade com o comportamento atual).
        const lyricsType = modeToLyricsType[mode] ?? "instrumental";
        udioArgs.lyricsType = lyricsType;
        if (lyricsType === "user" && typeof lyrics === "string" && lyrics.trim()) {
          udioArgs.lyrics = lyrics; // texto original do usuário — sem translateToEnglish
        }
        if (typeof negative_tags === "string" && negative_tags.trim()) {
          udioArgs.negativeTags = negative_tags.trim();
        }
        if (typeof seed === "number" && Number.isFinite(seed)) {
          udioArgs.seed = seed;
        }
      }

      // P5f — ACE-Step Music (Qubico/ace-step, kind music): 2 modos oficiais.
      // instrumental → lyrics OFICIAL "[inst]" (corrige o antigo lyrics:"" mudo);
      // lyrics → letra do usuário (NÃO traduzida). negative_prompt opcional (não
      // traduzido). style_prompt = promptEn (comportamento atual). Só anexado ao
      // profile ace-step-music — SFX (ace-step-sfx) e Udio não recebem estes args.
      const aceArgs: { lyrics?: string; negativePrompt?: string } = {};
      if (audioUiSpec.profile === "ace-step-music") {
        const mode = music_mode === "lyrics" ? "lyrics" : "instrumental";
        aceArgs.lyrics =
          mode === "lyrics" && typeof lyrics === "string" ? lyrics : "[inst]";
        if (typeof negative_prompt === "string" && negative_prompt.trim()) {
          aceArgs.negativePrompt = negative_prompt.trim();
        }
      }

      // P5h — MMAudio real (Qubico/mmaudio, video2audio): video (URL pública já
      // validada) + prompt (traduzido, como os demais) + negative_prompt opcional
      // (NÃO traduzido). Só anexado ao profile MMAudio — sem vazamento para os
      // outros profiles.
      const mmaudioArgs: { video?: string; negativePrompt?: string } = {};
      if (audioUiSpec.profile === "mmaudio-video2audio") {
        mmaudioArgs.video = typeof video_url === "string" ? video_url : undefined;
        if (typeof negative_prompt === "string" && negative_prompt.trim()) {
          mmaudioArgs.negativePrompt = negative_prompt.trim();
        }
      }

      // P4i — via Provider Registry → PiAPI adapter → MESMO generateAudio.
      // Música/SFX: args base (model=backend, prompt=promptEn, duration, quality).
      // Udio (P5e) adiciona lyricsType/lyrics/negativeTags/seed; ACE-Step Music
      // (P5f) adiciona lyrics/negativePrompt. Só o profile correspondente recebe
      // seus campos — sem vazamento entre profiles (SFX não recebe nenhum).
      // O task_id vem de submission.providerTaskId. Branch continua ASSÍNCRONO.
      const piapiTask = {
        canonicalId: aiModel.model_id,   // identidade canônica estável (catálogo)
        requestId,                       // correlação da execução (separada)
        type: "audio",
        providerModelId: backend,
        input: {},
        params: {
          call: {
            op: "audio",
            args: {
              model: backend,
              prompt: promptEn,
              duration,
              quality: qualityLevel,
              ...udioArgs,
              ...aceArgs,
              ...mmaudioArgs,
            },
          },
        },
      } satisfies GenTask;
      const submission = await getProvider("piapi").submit(piapiTask);
      const taskId = submission.providerTaskId;

      await supabase
        .from("generations")
        .update({ provider_task_id: taskId, status: "processing" })
        .eq("id", generation.id);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: taskId,
        credits_used: cost,
        balance: newBalance,
      });
    } catch (apiError) {
      await refundCredits(service, user.id, generation.id, cost, requestId);
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
