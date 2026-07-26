import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildVideoPayload, submitVideoTask } from "@/lib/piapi/client";
import type { VideoModelParams } from "@/lib/piapi/client";
import { planAllows } from "@/lib/plans";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { HIGH_COST_THRESHOLD_CREDITS, HIGH_COST_COOLDOWN_SECONDS } from "@/lib/constants";
import { validateVideoRequest } from "@/lib/generation-validation";
import { validateGenerationInput } from "@/lib/validate-generation";
import { auditLog, newRequestId, truncate } from "@/lib/audit-log";

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

    const cost = effectiveCost(aiModel.credit_cost, profile?.plan ?? "free");

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
        prompt,
        quality: qualityLevel,
        duration: typeof duration === "number" ? duration : undefined,
        resolution: typeof resolution === "string" ? resolution : undefined,
        aspectRatio: aspect_ratio,
        imageUrl: start_image_url,
        endImageUrl: end_image_url,
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
