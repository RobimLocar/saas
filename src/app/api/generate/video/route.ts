import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildVideoPayload, submitVideoTask, resolveVideoDurationSeconds } from "@/lib/piapi/client";
import type { VideoModelParams } from "@/lib/piapi/client";
import { planAllows } from "@/lib/plans";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { HIGH_COST_THRESHOLD_CREDITS, HIGH_COST_COOLDOWN_SECONDS } from "@/lib/constants";
import { validateVideoRequest } from "@/lib/generation-validation";
import { validateGenerationInput } from "@/lib/validate-generation";
import { auditLog, newRequestId, truncate } from "@/lib/audit-log";
import { translateToEnglish } from "@/lib/translate";

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // AUDIT: falha de autenticação — request rejeitada ANTES de qualquer chamada externa
      auditLog("api.generate.video", "auth_falhou_401", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();

    // AUDIT: entrada da rota com body completo (URLs longas truncadas)
    auditLog("api.generate.video", "entrada", requestId, {
      user_id: user.id,
      body: JSON.parse(JSON.stringify(body, (k, v) => truncate(v, 500))),
    });
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
      // ETAPA 3.4 — áudio de dublagem do Kling Avatar (URL pública já hospedada
      // pelo /api/upload). Formato único do contrato: `dubbing_audio_url`.
      dubbing_audio_url,
      // ETAPA 4.1 — comprimento REAL do áudio (segundos), medido no cliente.
      // Usado APENAS para cobrar o Kling Avatar (cujo vídeo dura o tamanho do áudio).
      dubbing_seconds,
    } = body;
    const qualityLevel: "low" | "medium" | "high" =
      quality === "low" || quality === "medium" ? quality : "high";

    // Validação local anti-SSRF/entrada (antes de qualquer DB ou débito)
    const inputValidation = validateGenerationInput({
      aspect_ratio,
      start_image_url,
      end_image_url,
      reference_images,
      reference_videos,
      reference_audios,
      duration,
    });
    if (!inputValidation.ok) {
      auditLog("api.generate.video", "validacao_local_400", requestId, {
        error: inputValidation.error,
      });
      return NextResponse.json({ error: inputValidation.error }, { status: 400 });
    }

    console.log(
      "[video/generate] REQUEST",
      JSON.stringify({
        prompt: typeof prompt === "string" ? prompt.slice(0, 50) : prompt,
        model_uuid,
        aspect_ratio,
        duration,
        resolution,
        has_start_img: !!start_image_url,
        has_end_img: !!end_image_url,
        reference_images_count: Array.isArray(reference_images)
          ? reference_images.length
          : 0,
        reference_videos_count: Array.isArray(reference_videos)
          ? reference_videos.length
          : 0,
        with_audio,
        quality: qualityLevel,
      })
    );

    if (!prompt || !model_uuid) {
      // AUDIT: validação de entrada falhou — nada foi debitado, PiAPI NÃO foi chamada
      auditLog("api.generate.video", "validacao_falhou_400", requestId, {
        has_prompt: Boolean(prompt),
        has_model_uuid: Boolean(model_uuid),
      }, Date.now() - t0);
      return NextResponse.json(
        { error: "Prompt e modelo são obrigatórios" },
        { status: 400 }
      );
    }

    // Prompt sempre em inglês para a IA (best-effort; devolve o original se falhar).
    const promptEn = await translateToEnglish(
      typeof prompt === "string" ? prompt : ""
    );

    // Buscar modelo pelo identificador do provider (ai_models.model_id)
    const { data: aiModel } = await supabase
      .from("ai_models")
      .select("*")
      .eq("id", model_uuid)
      .eq("is_active", true)
      .single();

    if (!aiModel) {
      console.warn("[video/generate] MODEL_NOT_FOUND", model_uuid);
      // AUDIT: modelo inexistente/inativo — nada debitado, PiAPI NÃO foi chamada
      auditLog("api.generate.video", "modelo_nao_encontrado_404", requestId, {
        model_uuid,
      }, Date.now() - t0);
      return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 });
    }

    // Verificação de e-mail para modelos Rosto Real (less_restriction)
    const modelParamsCheck = (aiModel.params as Record<string, unknown>) || {};
    if (modelParamsCheck.less_restriction === true) {
      if (!user.email_confirmed_at) {
        auditLog("api.generate.video", "email_nao_verificado_403", requestId, {
          model: aiModel.name,
          user_id: user.id,
        }, Date.now() - t0);
        return NextResponse.json(
          { error: "Verifique seu e-mail para usar o modelo Rosto Real." },
          { status: 403 }
        );
      }
    }

    {
      const mp = (aiModel.params as VideoModelParams) || {};
      console.log(
        "[video/generate] MODEL",
        JSON.stringify({
          name: aiModel.name,
          backend: mp.backend,
          task_type: mp.task_type,
          output_key: mp.output_key,
          credit_cost: aiModel.credit_cost,
        })
      );
    }

    // Verificar créditos e plano
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    // Custo: modelos com credit_per_second (ex.: Seedance) cobram por
    // duração × resolução; os demais mantêm o credit_cost fixo do catálogo.
    const videoCostParams = (aiModel.params as Record<string, unknown> | null) || {};
    const cpsMap = videoCostParams.credit_per_second as Record<string, number> | undefined;
    let baseVideoCost = aiModel.credit_cost;
    if (cpsMap && typeof cpsMap === "object") {
      // ETAPA 2.1 Q3 — cobra pela MESMA duração que o adapter vai executar
      // (fonte única resolveVideoDurationSeconds), não por round(duration).
      // Elimina divergência cobrança×execução (ex.: 7s → executa 5s → cobra 5s).
      const durNum = Number(duration);
      let dsafe = resolveVideoDurationSeconds(
        aiModel.params as VideoModelParams,
        Number.isFinite(durNum) && durNum > 0 ? durNum : undefined
      );
      // ETAPA 4.1 + 6 — Kling Avatar: o vídeo dura o COMPRIMENTO DO ÁUDIO (o provider
      // ignora a duração da UI). Cobrar pelos segundos REAIS. ETAPA 6: mede a
      // duração no SERVIDOR (music-metadata) — anti-abuso; o `dubbing_seconds`
      // enviado pelo cliente vira apenas FALLBACK se a medição falhar.
      // Não altera a fórmula (cps × segundos × plano) nem outros modelos.
      if ((aiModel.params as VideoModelParams)?.task_type === "avatar") {
        const AVATAR_MIN_SECONDS = 1;
        const AVATAR_MAX_SECONDS = 120; // teto defensivo (bilhetagem)
        let serverSecs = 0;
        if (dubbingUrl) {
          try {
            const audioRes = await fetch(dubbingUrl);
            if (audioRes.ok) {
              const buf = Buffer.from(await audioRes.arrayBuffer());
              const mm = await import("music-metadata");
              const meta = await mm.parseBuffer(new Uint8Array(buf), {
                mimeType: audioRes.headers.get("content-type") || undefined,
              });
              serverSecs = Number(meta.format?.duration) || 0;
            }
          } catch (e) {
            auditLog("api.generate.video", "avatar_audio_medicao_falhou", requestId, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        // Servidor tem PRIORIDADE; cliente (dubbing_seconds) é só fallback.
        const secs = serverSecs > 0 ? serverSecs : Number(dubbing_seconds);
        if (Number.isFinite(secs) && secs > 0) {
          dsafe = Math.min(Math.max(Math.ceil(secs), AVATAR_MIN_SECONDS), AVATAR_MAX_SECONDS);
        }
      }
      const resKey = typeof resolution === "string" && resolution ? resolution : "720p";
      let rate = Number(cpsMap[resKey] ?? cpsMap["720p"] ?? 0);
      // ETAPA 6 — Veo cobra MENOS sem áudio. Doc (veo3-api/veo31-api): áudio OFF é
      // metade do preço no tier quality (0.24→0.12) e ~2/3 no tier fast (0.09→0.06).
      // A cps do catálogo é a tarifa áudio-ON; aplicamos o fator áudio-OFF quando
      // with_audio === false. Só afeta Veo; demais modelos inalterados.
      {
        const vp = aiModel.params as VideoModelParams;
        if ((vp?.backend === "veo3" || vp?.backend === "veo3.1") && with_audio === false) {
          const offFactor = String(vp?.task_type || "").includes("fast") ? 2 / 3 : 0.5;
          rate = rate * offFactor;
        }
      }
      if (rate > 0) baseVideoCost = Math.ceil(rate * dsafe);
    }
    const cost = effectiveCost(baseVideoCost, profile?.plan ?? "free");

    if (!profile || profile.credits_balance < cost) {
      // AUDIT: saldo insuficiente — bloqueado ANTES do débito e ANTES da PiAPI
      auditLog("api.generate.video", "creditos_insuficientes_402", requestId, {
        credits_balance: profile?.credits_balance ?? null,
        credit_cost_base: aiModel.credit_cost,
        credit_cost_effective: cost,
        model: aiModel.name,
      }, Date.now() - t0);
      return NextResponse.json(
        { error: "Créditos insuficientes", required: cost, available: profile?.credits_balance || 0 },
        { status: 402 }
      );
    }

    // Gating por plano mínimo do modelo
    if (!planAllows(profile.plan, aiModel.min_plan)) {
      // AUDIT: plano insuficiente — bloqueado antes do débito e da PiAPI
      auditLog("api.generate.video", "plano_insuficiente_403", requestId, {
        user_plan: profile.plan,
        min_plan: aiModel.min_plan,
      }, Date.now() - t0);
      return NextResponse.json(
        { error: `Este modelo requer o plano ${aiModel.min_plan}` },
        { status: 403 }
      );
    }

    // Cliente service-role para mutações de crédito (débito/estorno atômicos,
    // ignoram RLS) — ver src/lib/credits.ts.
    const service = createServiceClient();

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
          auditLog("api.generate.video", "cooldown_bloqueado", requestId, {
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

    // Params de roteamento do modelo (backend/task_type/output_key/dur)
    const modelParams = (aiModel.params as VideoModelParams) || {};

    // ETAPA 3.4 — Kling Avatar (task_type "avatar") EXIGE áudio de dublagem +
    // imagem de retrato. Validar ANTES de reservar/debitar crédito e ANTES de
    // chamar a PiAPI (senão o usuário é cobrado por uma task que falharia).
    const dubbingUrl =
      typeof dubbing_audio_url === "string" && /^https?:\/\//i.test(dubbing_audio_url)
        ? dubbing_audio_url
        : "";
    if (modelParams.task_type === "avatar") {
      const portrait =
        typeof start_image_url === "string" && start_image_url
          ? start_image_url
          : Array.isArray(reference_images) && reference_images[0]
          ? reference_images[0]
          : "";
      if (!dubbingUrl) {
        auditLog("api.generate.video", "avatar_sem_audio_400", requestId, {
          model: aiModel.name,
        }, Date.now() - t0);
        return NextResponse.json(
          { error: "Kling Avatar requer um áudio de dublagem. Envie/conecte um áudio antes de gerar." },
          { status: 400 }
        );
      }
      if (!portrait) {
        return NextResponse.json(
          { error: "Kling Avatar requer uma imagem de retrato (frame inicial)." },
          { status: 400 }
        );
      }
    }

    // BLOCO 3 (§3.2): validações LOCAIS antes do débito — rejeita cedo (400)
    // requisições comprovadamente inválidas, sem debitar nem criar task paga.
    const validation = await validateVideoRequest(
      {
        aspect_ratio,
        duration,
        start_image_url,
        end_image_url,
        reference_images,
        reference_videos,
        reference_audios,
      },
      modelParams,
      requestId
    );
    if (!validation.ok) {
      auditLog("api.generate.video", "validacao_local_falhou_400", requestId, {
        error: validation.error,
      }, Date.now() - t0);
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    // A rota de status precisa do output_key para extrair a URL certa da PiAPI.
    const outputKey = modelParams.output_key || "output.video_url";

    // Criar geração — guardamos o output_key nos params da geração
    const { data: generation } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        model_id: aiModel.id,
        type: "video",
        prompt: promptEn,
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
        credits_used: cost,
      })
      .select()
      .single();

    if (!generation) {
      // Nada foi debitado ainda (o débito ocorre logo abaixo, atrelado ao job).
      auditLog("api.generate.video", "insert_generation_falhou_500", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
    }

    auditLog("api.generate.video", "generation_criada", requestId, {
      generation_id: generation.id,
      status: "pending",
    }, Date.now() - t0);

    // BLOCO 2 (§3.3): DÉBITO ATÔMICO idempotente atrelado ao job. Faz CAS no
    // saldo (nunca fica negativo, mesmo sob concorrência) e registra o ledger
    // (reason "generation"). Ver src/lib/credits.ts.
    const debit = await debitCredits(
      service,
      user.id,
      cost,
      generation.id,
      requestId
    );
    if (!debit.ok) {
      // Marca a geração como falha (nenhum crédito foi retirado).
      await service
        .from("generations")
        .update({ status: "failed", error_message: "Falha ao debitar créditos" })
        .eq("id", generation.id);
      if ("insufficient" in debit) {
        auditLog("api.generate.video", "creditos_insuficientes_402", requestId, {
          generation_id: generation.id,
          credit_cost_base: aiModel.credit_cost,
          credit_cost_effective: cost,
        }, Date.now() - t0);
        return NextResponse.json(
          { error: "Créditos insuficientes", required: cost, available: profile.credits_balance },
          { status: 402 }
        );
      }
      auditLog("api.generate.video", "debito_falhou_500", requestId, {
        generation_id: generation.id,
        error: debit.error,
      }, Date.now() - t0);
      return NextResponse.json({ error: "Erro ao debitar créditos" }, { status: 500 });
    }
    const newBalance = debit.balance;
    auditLog("api.generate.video", "creditos_debitados", requestId, {
      custo: cost,
      depois: newBalance,
    }, Date.now() - t0);

    // Chamar PiAPI
    try {
      // Monta o payload correto por backend (kling/kling-turbo/seedance/Wan/
      // hailuo/veo3/veo3.1) conforme os docs oficiais da PiAPI.
      const payload = buildVideoPayload({
        params: modelParams,
        prompt: promptEn,
        quality: qualityLevel,
        duration: typeof duration === "number" ? duration : undefined,
        resolution: typeof resolution === "string" ? resolution : undefined,
        aspectRatio: aspect_ratio,
        imageUrl: start_image_url,
        endImageUrl: end_image_url,
        // ETAPA 3.4 — áudio de dublagem do Kling Avatar → local_dubbing_url.
        dubbingAudioUrl: dubbingUrl || undefined,
        referenceImages: Array.isArray(reference_images) ? reference_images : undefined,
        referenceVideos: Array.isArray(reference_videos) ? reference_videos : undefined,
        referenceAudios: Array.isArray(reference_audios) ? reference_audios : undefined,
        shots: Array.isArray(shots) ? shots : undefined,
        withAudio: typeof with_audio === "boolean" ? with_audio : undefined,
        negativePrompt: negative_prompt,
        // less-restriction: o catálogo do modelo (params.less_restriction) força
        // a variante; o body do usuário também pode solicitá-la explicitamente.
        lessRestriction:
          modelParams.less_restriction === true || body?.less_restriction === true,
        // tier do Seedance: catálogo tem prioridade; senão respeita o body.
        seedanceTier:
          modelParams.seedance_tier ||
          (typeof body?.seedance_tier === "string"
            ? (body.seedance_tier as "pro" | "fast" | "mini")
            : undefined),
        requestId,
      });

      console.log("[video/generate] PAYLOAD", JSON.stringify(payload));

      const task = await submitVideoTask(payload, requestId);

      console.log(
        "[video/generate] PIAPI_RESPONSE",
        JSON.stringify({
          task_id: task?.data?.task_id,
          status: task?.data?.status,
        })
      );

      await supabase
        .from("generations")
        .update({ provider_task_id: task.data.task_id, status: "processing" })
        .eq("id", generation.id);

      // AUDIT: sucesso — task criada na PiAPI, geração em processing
      auditLog("api.generate.video", "sucesso_200", requestId, {
        generation_id: generation.id,
        task_id: task.data.task_id,
        credits_used: cost,
        balance: newBalance,
      }, Date.now() - t0);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: task.data.task_id,
        credits_used: cost,
        balance: newBalance,
      });
    } catch (apiError) {
      console.error("[video/generate] PIAPI_ERROR", {
        message: apiError instanceof Error ? apiError.message : String(apiError),
        stack: apiError instanceof Error ? apiError.stack : undefined,
      });
      // Propaga o erro real da PiAPI para o frontend (ex.: "insufficient credits").
      const errMsg =
        apiError instanceof Error ? apiError.message : String(apiError);
      // Estorno IDEMPOTENTE (§3.3): credita de volta só se ainda não houve refund
      // para este job — evita estorno duplicado se o webhook/polling também rodar.
      await refundCredits(service, user.id, generation.id, cost, requestId);
      await service
        .from("generations")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", generation.id);
      const lower = errMsg.toLowerCase();
      const isInsufficientCredits =
        lower.includes("insufficient credits") ||
        lower.includes("freeze credit") ||
        lower.includes("quota not enough") ||
        lower.includes("account point");
      // Provider indisponível (HTML/non-JSON, ex.: challenge Cloudflare / sobrecarga)
      // → 503, sinalizando ao frontend que é temporário e pode tentar novamente.
      const isProviderUnavailable =
        lower.includes("temporariamente indisponível") ||
        lower.includes("recebeu html") ||
        lower.includes("em vez de json") ||
        lower.includes("non_json");
      const status = isInsufficientCredits
        ? 402
        : isProviderUnavailable
        ? 503
        : 502;
      // AUDIT: falha na PiAPI — créditos estornados, geração marcada failed
      auditLog("api.generate.video", "piapi_erro_estorno", requestId, {
        generation_id: generation.id,
        http_status_devolvido: status,
        error: errMsg,
        creditos_estornados: cost,
      }, Date.now() - t0);
      return NextResponse.json({ error: errMsg }, { status });
    }
  } catch (err) {
    console.error("[generate/video] Error:", err);
    auditLog("api.generate.video", "excecao_500", requestId, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? truncate(err.stack, 1500) : undefined,
    }, Date.now() - t0);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
