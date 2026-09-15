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
import { isAtlasRuntime, submitAtlasGeneration, resolveAtlasModelForMode } from "@/lib/atlas/dispatch";
import { cachedQuoteAtlas, atlasQuoteToRawCredits } from "@/lib/atlas/quote";
import { getAtlasContract, THINKING_LEVELS } from "@/lib/atlas/profiles";
import { isValidCombo, type VideoModelMeta } from "@/lib/models/video-selector";
import { resolveVideoCapabilities, durationsForResolution, type VideoModelForCaps } from "@/lib/models/video-capabilities";
import { validateReferenceRefs, validateVoiceIds, buildKlingAdvanced } from "@/lib/models/reference-schema";
import { auditLog, newRequestId, truncate } from "@/lib/audit-log";
import { translateToEnglish } from "@/lib/translate";
import { videoRequestFingerprint, classifyIntentDuplicate } from "@/lib/idempotency";
import {
  normalizeIntentId,
  newCallbackToken,
  classifySubmitError,
  PROVIDER_POLL_INTERVAL_SECONDS,
  SUBMISSION_UNKNOWN_WINDOW_SECONDS,
} from "@/lib/webhooks/reliability-runtime";

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
      // ETAPA 7.2.1.1 — comprimento REAL do vídeo de movimento (segundos), medido
      // no cliente. Fallback quando a medição no servidor falhar (Kling Motion).
      motion_seconds,
      // ETAPA 7.3.2 — Veo: reference images (veo3.1) e seed (text-to-video).
      reference_image_urls,
      seed,
      // ETAPA 7.4.7.2 — Seedance video reference: durações (s) dos vídeos de
      // entrada, medidas no cliente. Fallback quando a medição no servidor falhar.
      video_ref_seconds,
      // ETAPA 7.5.2 — Wan: shot_type (single/multi) e prompt_extend (bool).
      shot_type,
      prompt_extend,
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

    // P11a — runtime Atlas explícito (opt-in via catálogo). Aditivo: modelos PiAPI
    // (sem runtime_provider) seguem 100% inalterados.
    const atlasParams = (aiModel.params as Record<string, unknown>) || {};
    const atlasRuntime = isAtlasRuntime(atlasParams);
    const atlasContract = atlasRuntime
      ? getAtlasContract(atlasParams.atlas_contract as string)
      : null;

    // P11a/COMPETITOR-VIDEO-02 — validação AUTORITATIVA pré-débito p/ Atlas (mesma
    // metadata/regras do seletor; sem coerção silenciosa). Modo suportado + combo
    // resolução×duração válido (ex.: Veo Lite 1080p exige 8s; Grok >15s; H3 <4s).
    const atlasMode = typeof body?.mode === "string" ? body.mode : "text-to-video";
    // §17 — conjunto combinado de referências (imgs+vids+auds) p/ modelos com
    // reference_media mixto; preenchido na validação e reusado no payload.
    let atlasReferenceRefs: string[] | null = null;
    if (atlasRuntime) {
      const supportedModes = Array.isArray(atlasParams.modes)
        ? (atlasParams.modes as string[])
        : ["text-to-video"];
      if (!supportedModes.includes(atlasMode)) {
        return NextResponse.json({ error: `Modo não suportado: ${atlasMode}` }, { status: 400 });
      }
      const meta: VideoModelMeta = {
        id: model_uuid,
        model_id: aiModel.model_id,
        name: aiModel.name,
        resolution: (atlasParams.resolution as string) || null,
        dur_min: Number(atlasParams.dur_min) || null,
        dur_max: Number(atlasParams.dur_max) || null,
        resolution_duration_rule: (atlasParams.resolution_duration_rule as string) || null,
        credit_per_second: (atlasParams.credit_per_second as Record<string, number>) || null,
        max_reference_images: Number(atlasParams.max_reference_images) || null,
        resolution_by_mode:
          (atlasParams.resolution_by_mode as Record<string, string[]>) || null,
      };
      const atlasRefs = Array.isArray(reference_image_urls)
        ? reference_image_urls
        : Array.isArray(reference_images)
          ? reference_images
          : [];
      const combo = isValidCombo(meta, {
        resolution: typeof resolution === "string" ? resolution : undefined,
        duration: typeof duration === "number" ? duration : undefined,
        referenceCount: atlasRefs.length,
        mode: atlasMode,
      });
      if (!combo.ok) {
        auditLog("api.generate.video", "atlas_combo_invalido_400", requestId, {
          model_id: aiModel.model_id,
          mode: atlasMode,
          resolution,
          duration,
          reason: combo.reason,
        });
        return NextResponse.json({ error: combo.reason }, { status: 400 });
      }
      // MODEL-PROPERTIES — validação de propriedades por model+mode via a MESMA verdade
      // que a UI consome (resolveVideoCapabilities). Fail-closed pré-débito: resolução,
      // aspect ou duração forjadas fora do suportado → 400 (browser nunca é autoridade).
      const caps = resolveVideoCapabilities(
        atlasParams as unknown as VideoModelForCaps,
        atlasMode,
        typeof duration === "number" ? duration : 6
      );
      if (typeof resolution === "string" && caps.resolutions.length > 0 && !caps.resolutions.includes(resolution)) {
        return NextResponse.json({ error: `Resolução ${resolution} não suportada por este modelo/modo.` }, { status: 400 });
      }
      if (typeof aspect_ratio === "string" && caps.aspectRatios.length > 0 && !caps.aspectRatios.includes(aspect_ratio)) {
        return NextResponse.json({ error: `Proporção ${aspect_ratio} não suportada por este modelo.` }, { status: 400 });
      }
      if (typeof duration === "number") {
        const durSpec = durationsForResolution(
          caps,
          atlasParams as unknown as VideoModelForCaps,
          typeof resolution === "string" ? resolution : undefined
        );
        if (durSpec.kind === "enum" && Array.isArray(durSpec.values) && !durSpec.values.includes(duration)) {
          return NextResponse.json(
            { error: `Duração ${duration}s inválida para ${resolution || "este modelo"} (permitidas: ${durSpec.values.join(", ")}s).` },
            { status: 400 }
          );
        }
        if (durSpec.kind === "range" && durSpec.min != null && durSpec.max != null && (duration < durSpec.min || duration > durSpec.max)) {
          return NextResponse.json({ error: `Duração ${duration}s fora do intervalo ${durSpec.min}–${durSpec.max}s.` }, { status: 400 });
        }
      }
      // §17 — REFERÊNCIAS MIXTAS: modelos cujo reference_media inclui video/audio
      // (ex.: MiniMax H3) exigem AO MENOS uma IMAGEM ou VÍDEO — áudio sozinho é
      // inválido. 400 PRÉ-DÉBITO. Também aplica o limite max_reference_images. O
      // conjunto combinado (imgs+vids+auds) é reutilizado no payload do provider.
      if (atlasMode === "reference-to-video" || atlasMode === "reference-mixed") {
        const refMedia = Array.isArray(atlasParams.reference_media)
          ? (atlasParams.reference_media as string[])
          : ["image"];
        const imgs = Array.isArray(reference_image_urls)
          ? reference_image_urls
          : Array.isArray(reference_images)
            ? reference_images
            : [];
        const vids = refMedia.includes("video") && Array.isArray(reference_videos) ? reference_videos : [];
        const auds = refMedia.includes("audio") && Array.isArray(reference_audios) ? reference_audios : [];
        const allRefs = [...imgs, ...vids, ...auds].filter((u): u is string => typeof u === "string");
        const refVal = validateReferenceRefs(allRefs, {
          requireVisual: atlasParams.reference_requires_visual === true,
          max: Number(atlasParams.max_reference_images) || undefined,
        });
        if (!refVal.ok) {
          auditLog("api.generate.video", "atlas_reference_invalida_400", requestId, {
            model_id: aiModel.model_id,
            error: refVal.error,
          });
          return NextResponse.json({ error: refVal.error }, { status: 400 });
        }
        atlasReferenceRefs = allRefs;
      }
      // §13/§14 — SAFETY: nosso motor cobra por SEGUNDO (cps × duração × plano).
      // Modelos Atlas token-billed (Seedance 2.x: Video Tokens/1e6 × Token Rate ×
      // Resolution Multiplier, computados na conclusão) têm UNIDADE incompatível.
      // FAIL-CLOSED: nunca pré-debitar por-segundo um modelo cuja unidade oficial é
      // "video_tokens". Garante "zero unsafe-billing active" mesmo se ativado por
      // engano antes de implementar billing na conclusão. (docs: billing/model-billing.)
      if (atlasParams.atlas_billing_unit === "video_tokens") {
        auditLog("api.generate.video", "atlas_billing_unit_incompativel_400", requestId, {
          model_id: aiModel.model_id,
        });
        return NextResponse.json(
          { error: "Este modelo usa cobrança por tokens de vídeo e ainda não está disponível." },
          { status: 400 }
        );
      }
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

    // Kling Avatar: URL do áudio de dublagem (normalizada). Declarada AQUI —
    // antes do bloco de billing que a consome (fix de temporal dead zone).
    // Mesma expressão/origem de antes; apenas movida para cima. Declaração única.
    const dubbingUrl =
      typeof dubbing_audio_url === "string" && /^https?:\/\//i.test(dubbing_audio_url)
        ? dubbing_audio_url
        : "";

    // Custo: modelos com credit_per_second (ex.: Seedance) cobram por
    // duração × resolução; os demais mantêm o credit_cost fixo do catálogo.
    const videoCostParams = (aiModel.params as Record<string, unknown> | null) || {};
    const cpsMap = videoCostParams.credit_per_second as Record<string, number> | undefined;
    let baseVideoCost = aiModel.credit_cost;

    // §5 — ATLAS QUOTED BILLING: modelos compound/token/frame (ex.: LTX, Gemini
    // Reference/Edit, Seedance 4K token-billed) precificam via /calculate
    // (origin_price → créditos), NÃO por cps estático. Fail-closed: sem quote
    // confiável NÃO debita (400). Server é a autoridade (browser nunca envia USD).
    // Só afeta modelos Atlas com params.billing_mode="atlas_quote".
    let quotedBilling = false;
    if (atlasRuntime && atlasParams.billing_mode === "atlas_quote") {
      const providerModel = resolveAtlasModelForMode(
        atlasParams.atlas_model as string,
        (atlasParams.atlas_models_by_mode as Record<string, string>) || null,
        atlasMode
      );
      const quoteBody: Record<string, unknown> = { model: providerModel, prompt: promptEn };
      if (typeof resolution === "string") quoteBody.resolution = resolution;
      if (typeof duration === "number") quoteBody.duration = duration;
      if (typeof with_audio === "boolean") quoteBody.generate_audio = with_audio;
      const refsForQuote = Array.isArray(reference_image_urls)
        ? reference_image_urls
        : Array.isArray(reference_images)
          ? reference_images
          : [];
      if (refsForQuote.length) quoteBody.refers = refsForQuote;
      const q = await cachedQuoteAtlas(quoteBody);
      const conv = atlasQuoteToRawCredits(q, {
        estimatedSafetyFactor: Number(atlasParams.estimated_safety_factor) || 1.25,
      });
      if (!conv.ok) {
        auditLog("api.generate.video", "atlas_quote_indisponivel_400", requestId, {
          model_id: aiModel.model_id,
          error: q.error,
        });
        return NextResponse.json(
          { error: "Não foi possível calcular o custo deste modelo agora. Tente novamente." },
          { status: 400 }
        );
      }
      baseVideoCost = conv.rawCredits;
      quotedBilling = true;
    }

    if (!quotedBilling && cpsMap && typeof cpsMap === "object") {
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
      // ETAPA 7.2.1.1 — Kling Motion: contrato MODE→RESOLUTION→PREÇO→BILLING fechado.
      // Fonte ÚNICA do modo = catálogo (`params.kling_mode`); default "pro" (o
      // catálogo anuncia resolution 1080p). P6d — o SKU ATIVO é Kling 3.0 Motion
      // Control (kling_version 3.0); rates oficiais 3.0: std = 720p ($0.195/s) ·
      // pro = 1080p ($0.260/s ≈ 1.33× std). (As rates 2.6 — $0.065/$0.104 — não se
      // aplicam ao SKU ativo.) cps do catálogo (720:15.6 · 1080:24.96) cobre 3.0 pro.
      // O vídeo é cobrado pela DURAÇÃO DO VÍDEO DE REFERÊNCIA (medida no servidor;
      // "billed duration is measured from the reference clip"): ≥3s e ≤30s. No
      // caminho de PRESET (sem vídeo) a dança do PiAPI dura 5s ("5-Second Dance").
      let motionResKey = "";
      if ((aiModel.params as VideoModelParams)?.task_type === "motion_control") {
        const MOTION_MIN_SECONDS = 3; // provider rejeita <3s
        const MOTION_MAX_SECONDS = 30; // orientation "video" ⇒ até 30s
        const MOTION_PRESET_SECONDS = 5; // preset de dança PiAPI = 5s (documentado)
        const kmode = (aiModel.params as VideoModelParams)?.kling_mode;
        const motionMode = kmode === "std" ? "std" : "pro";
        motionResKey = motionMode === "pro" ? "1080p" : "720p"; // modo define a resolução cobrada
        const motionVideoUrl =
          Array.isArray(reference_videos) &&
          typeof reference_videos[0] === "string" &&
          /^https?:\/\//i.test(reference_videos[0])
            ? reference_videos[0]
            : "";
        if (motionVideoUrl) {
          let motionSecs = 0;
          try {
            const vres = await fetch(motionVideoUrl);
            if (vres.ok) {
              const vbuf = Buffer.from(await vres.arrayBuffer());
              const mm = await import("music-metadata");
              const vmeta = await mm.parseBuffer(new Uint8Array(vbuf), {
                mimeType: vres.headers.get("content-type") || undefined,
              });
              motionSecs = Number(vmeta.format?.duration) || 0;
            }
          } catch (e) {
            auditLog("api.generate.video", "motion_video_medicao_falhou", requestId, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
          // servidor tem prioridade; cliente (motion_seconds) é só fallback.
          if (!(motionSecs > 0)) motionSecs = Number(motion_seconds) || 0;
          if (!(motionSecs > 0)) {
            // Sem duração confiável NÃO cobramos (billed ≠ executed) — bloqueia pré-débito.
            auditLog("api.generate.video", "motion_video_sem_duracao_400", requestId, {});
            return NextResponse.json(
              { error: "Não foi possível medir a duração do vídeo de referência do Kling Motion." },
              { status: 400 }
            );
          }
          if (motionSecs < MOTION_MIN_SECONDS) {
            auditLog("api.generate.video", "motion_video_curto_400", requestId, { motionSecs });
            return NextResponse.json(
              { error: "O vídeo de referência do Kling Motion deve ter pelo menos 3 segundos." },
              { status: 400 }
            );
          }
          dsafe = Math.min(Math.ceil(motionSecs), MOTION_MAX_SECONDS);
        } else {
          // Preset (sem vídeo de referência): comprimento fixo documentado.
          dsafe = MOTION_PRESET_SECONDS;
        }
      }
      const resKey = motionResKey || (typeof resolution === "string" && resolution ? resolution : "720p");
      // ETAPA 7.4.4 — NUNCA rebaixar silenciosamente uma resolução ALTA para a
      // tarifa 720p (sub-cobrança). Se o modelo expõe 1080p/2160p/4k mas não tem
      // cps para ela, bloqueia PRÉ-DÉBITO em vez de cobrar a tarifa 720p.
      // (Resoluções ≤720 mantêm o fallback histórico p/ não afetar outros modelos.)
      if (
        (resKey === "1080p" || resKey === "2160p" || resKey === "4k") &&
        cpsMap[resKey] == null
      ) {
        auditLog("api.generate.video", "resolucao_sem_tarifa_400", requestId, { resKey });
        return NextResponse.json(
          { error: `Resolução ${resKey} sem tarifa configurada para este modelo.` },
          { status: 400 }
        );
      }
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
      // ETAPA 7.4.7.2 — Seedance Video Reference: FÓRMULA A (doc Pricing 2.0/2.5):
      //   base = cps × output + (cps/2) × input_video_total.
      // Mede a duração de CADA vídeo de entrada no servidor (music-metadata);
      // fallback para a duração medida no cliente (video_ref_seconds). Sem duração
      // confiável NÃO cobramos (bloqueia pré-débito). Clamp ao máximo do modelo
      // (2.5 → 30s; 2.0 → 15,4s). Só afeta Seedance com reference_videos.
      let seedanceInputVideoSecs = 0;
      {
        const vp2 = aiModel.params as VideoModelParams;
        if (vp2?.backend === "seedance" && Array.isArray(reference_videos) && reference_videos.length > 0) {
          const MAX_IN = String(vp2?.task_type || "").includes("2.5") ? 30 : 15.4;
          const vids = reference_videos
            .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
            .slice(0, 3);
          const clientSecs = Array.isArray(video_ref_seconds) ? (video_ref_seconds as unknown[]) : [];
          for (let i = 0; i < vids.length; i++) {
            let s = 0;
            try {
              const vres = await fetch(vids[i]);
              if (vres.ok) {
                const vbuf = Buffer.from(await vres.arrayBuffer());
                const mm = await import("music-metadata");
                const vmeta = await mm.parseBuffer(new Uint8Array(vbuf), {
                  mimeType: vres.headers.get("content-type") || undefined,
                });
                s = Number(vmeta.format?.duration) || 0;
              }
            } catch (e) {
              auditLog("api.generate.video", "seedance_video_medicao_falhou", requestId, {
                error: e instanceof Error ? e.message : String(e),
              });
            }
            if (!(s > 0)) s = Number(clientSecs[i]) || 0; // fallback cliente
            if (!(s > 0)) {
              auditLog("api.generate.video", "seedance_video_sem_duracao_400", requestId, {});
              return NextResponse.json(
                { error: "Não foi possível medir a duração do vídeo de referência." },
                { status: 400 }
              );
            }
            seedanceInputVideoSecs += s;
          }
          if (seedanceInputVideoSecs > MAX_IN + 0.5) {
            auditLog("api.generate.video", "seedance_video_duracao_400", requestId, {
              seedanceInputVideoSecs,
              MAX_IN,
            });
            return NextResponse.json(
              { error: `Os vídeos de referência somam mais de ${MAX_IN}s.` },
              { status: 400 }
            );
          }
        }
      }
      if (rate > 0) {
        // Fórmula A: output cheio + input pela metade (Seedance video reference).
        baseVideoCost = Math.ceil(rate * dsafe + (rate / 2) * seedanceInputVideoSecs);
      }
    } else if (
      (aiModel.params as VideoModelParams)?.backend === "hailuo" &&
      videoCostParams.credit_cost_map &&
      typeof videoCostParams.credit_cost_map === "object"
    ) {
      // ETAPA 7.5.1 — Hailuo cobra por (RESOLUÇÃO, DURAÇÃO, tier). O provider precifica
      // v2.3/v2.3-fast por combinação (6/10s × 768/1080). Replicamos AQUI o MESMO
      // mapeamento que o adapter executa (768/1080 e 6/10; 1080 só com duração 6),
      // cobrando o que de fato roda — nunca o credit_cost flat.
      const hDur = Number(duration) <= 8 ? 6 : 10;
      const wants1080 = typeof resolution === "string" && resolution.includes("1080");
      const hRes = wants1080 && hDur === 6 ? "1080" : "768";
      const ccMap = videoCostParams.credit_cost_map as Record<string, Record<string, number>>;
      const mapped = ccMap?.[hRes]?.[String(hDur)];
      if (typeof mapped === "number" && mapped > 0) {
        baseVideoCost = mapped;
      }
      // senão mantém aiModel.credit_cost (fallback defensivo).
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
    // (dubbingUrl já foi normalizado antes do bloco de billing — declaração única.)
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

    // ETAPA 7.4.6 — Seedance Reference Audio: validar ANTES do débito (schema oficial:
    // audio_urls ≤3, ≤15s total, mp3/wav[/ogg/m4a/aac no 2.5], EXIGE ao menos 1 imagem
    // ou vídeo). Áudio de referência NÃO altera billing (cps × duração de output).
    if (modelParams.backend === "seedance" && Array.isArray(reference_audios) && reference_audios.length > 0) {
      const seedAudios = reference_audios.filter(
        (u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)
      );
      // Quantidade ≤3.
      if (seedAudios.length > 3) {
        auditLog("api.generate.video", "seedance_audio_qtd_400", requestId, { n: seedAudios.length });
        return NextResponse.json(
          { error: "Máximo de 3 áudios de referência (Seedance)." },
          { status: 400 }
        );
      }
      // Formato permitido (union; o provider aplica o estrito por modelo).
      const okFmt = seedAudios.every((u) => /\.(mp3|wav|ogg|m4a|aac)(\?|#|$)/i.test(u));
      if (!okFmt) {
        return NextResponse.json(
          { error: "Áudio de referência deve ser mp3, wav, ogg, m4a ou aac." },
          { status: 400 }
        );
      }
      // Requisito: exige ao menos 1 imagem OU vídeo de referência.
      const hasImgOrVid =
        (Array.isArray(reference_images) && reference_images.length > 0) ||
        (typeof start_image_url === "string" && !!start_image_url) ||
        (typeof end_image_url === "string" && !!end_image_url) ||
        (Array.isArray(reference_videos) && reference_videos.length > 0);
      if (!hasImgOrVid) {
        auditLog("api.generate.video", "seedance_audio_sem_imagem_400", requestId, {});
        return NextResponse.json(
          { error: "Áudio de referência exige ao menos uma imagem (ou vídeo) de referência." },
          { status: 400 }
        );
      }
      // Duração total ≤15s (medida no servidor; anti-abuso). Se a medição falhar
      // por completo, não bloqueia por duração (o provider rejeita se >15s).
      let audioTotalSecs = 0;
      let measuredAny = false;
      for (const a of seedAudios) {
        try {
          const ares = await fetch(a);
          if (ares.ok) {
            const abuf = Buffer.from(await ares.arrayBuffer());
            const mm = await import("music-metadata");
            const ameta = await mm.parseBuffer(new Uint8Array(abuf), {
              mimeType: ares.headers.get("content-type") || undefined,
            });
            const s = Number(ameta.format?.duration) || 0;
            if (s > 0) { audioTotalSecs += s; measuredAny = true; }
          }
        } catch (e) {
          auditLog("api.generate.video", "seedance_audio_medicao_falhou", requestId, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      if (measuredAny && audioTotalSecs > 15.5) {
        auditLog("api.generate.video", "seedance_audio_duracao_400", requestId, { audioTotalSecs });
        return NextResponse.json(
          { error: "Os áudios de referência somam mais de 15 segundos." },
          { status: 400 }
        );
      }
    }

    // ETAPA 7.4.7.2 — Seedance Video Reference: validação de quantidade/formato
    // ANTES do débito (a duração/custo é medida no bloco de billing abaixo).
    // Schema: video_urls ≤3, mp4/mov. O provider cobra a duração do vídeo de
    // entrada (Fórmula A: cps×output + (cps/2)×input) — calculada no billing.
    if (modelParams.backend === "seedance" && Array.isArray(reference_videos) && reference_videos.length > 0) {
      const vids = reference_videos.filter(
        (u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)
      );
      if (vids.length > 3) {
        auditLog("api.generate.video", "seedance_video_qtd_400", requestId, { n: vids.length });
        return NextResponse.json(
          { error: "Máximo de 3 vídeos de referência (Seedance)." },
          { status: 400 }
        );
      }
      if (!vids.every((u) => /\.(mp4|mov)(\?|#|$)/i.test(u))) {
        return NextResponse.json(
          { error: "Vídeo de referência deve ser mp4 ou mov." },
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
        resolution,
        shots: Array.isArray(shots) ? shots : undefined,
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

    // FLUXYRA-PRODUCTION-CLOSE-01 §1/§2 — CLAIM ATÔMICO DE INTENÇÃO (anti double-submit).
    // O SERVIDOR é a autoridade do fingerprint e do callback_token. Uma intenção
    // (user_id, generation_intent_id) cria NO MÁXIMO uma generation. Mesma intenção +
    // mesmo fingerprint → RESUME (sem novo débito, sem novo submit). Mesma intenção +
    // fingerprint diferente → 409. Cliente pode reenviar por retry/duplo-clique: o
    // débito e o submit ocorrem UMA vez só. (Migration 140000 — unapplied.)
    const intentId = normalizeIntentId(body?.generation_intent_id);
    const requestFingerprint = videoRequestFingerprint(body as Record<string, unknown>);
    const callbackToken = newCallbackToken();
    const genParamsToStore: Record<string, unknown> = {
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
      // Snapshot de billing (base/plano/custo/modo) para auditoria e paridade refund.
      billing_snapshot: { base: baseVideoCost, plan: profile.plan, cost, mode: atlasMode },
      ...(atlasRuntime
        ? {
            runtime_provider: "atlas",
            atlas_contract: atlasParams.atlas_contract,
            atlas_output_kind: atlasContract?.outputKind ?? "media",
          }
        : {}),
    };

    const { data: claimRows, error: claimErr } = await service.rpc("claim_generation_intent", {
      p_user_id: user.id,
      p_intent_id: intentId,
      p_fingerprint: requestFingerprint,
      p_model_id: aiModel.id,
      p_type: "video",
      p_prompt: promptEn,
      p_negative_prompt: negative_prompt ?? null,
      p_params: genParamsToStore,
      p_credits: cost,
      p_callback_token: callbackToken,
    });
    const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as
      | { generation_id: string; is_new: boolean; existing_fingerprint: string | null; existing_status: string | null }
      | null;
    if (claimErr || !claim) {
      auditLog("api.generate.video", "insert_generation_falhou_500", requestId, {
        error: claimErr?.message,
      }, Date.now() - t0);
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
    }

    const generation = { id: claim.generation_id };

    if (!claim.is_new) {
      // Intenção já reivindicada por um request anterior (duplo-clique / retry).
      const dup = classifyIntentDuplicate(claim.existing_fingerprint, requestFingerprint);
      if (dup.kind === "reuse_conflict") {
        auditLog("api.generate.video", "intent_conflito_409", requestId, {
          generation_id: generation.id,
        }, Date.now() - t0);
        return NextResponse.json(
          { error: "Este identificador de geração já foi usado com outro conteúdo." },
          { status: 409 }
        );
      }
      // RESUME: devolve a generation existente SEM debitar nem reenviar ao provider.
      auditLog("api.generate.video", "intent_resume", requestId, {
        generation_id: generation.id,
        status: claim.existing_status,
      }, Date.now() - t0);
      return NextResponse.json({
        generation_id: generation.id,
        status: claim.existing_status,
        resumed: true,
        credits_used: cost,
      });
    }

    auditLog("api.generate.video", "generation_criada", requestId, {
      generation_id: generation.id,
      status: "pending",
      intent: intentId,
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

    // Lifecycle: pending → submitting (antes de tocar o provider).
    await service.from("generations").update({ status: "submitting" }).eq("id", generation.id);

    // §7 — submissão AMBÍGUA (rede/timeout/HTML/5xx): a task PODE ter sido criada.
    // NÃO reenviar, NÃO estornar ainda. Marca submission_unknown com janela; a
    // reconciliação (webhook por callback_token / poll) resolve; expirada a janela
    // sem sinal → estorno idempotente + failed (SUBMISSION_UNKNOWN_TIMEOUT).
    const markSubmissionUnknown = async (detail: string): Promise<NextResponse> => {
      const now = Date.now();
      const deadline = new Date(now + SUBMISSION_UNKNOWN_WINDOW_SECONDS * 1000).toISOString();
      await service
        .from("generations")
        .update({
          status: "submission_unknown",
          next_provider_poll_at: new Date(now + 15_000).toISOString(),
          params: { ...genParamsToStore, submission_deadline: deadline, submission_note: truncate(detail, 300) },
        })
        .eq("id", generation.id);
      auditLog("api.generate.video", "submission_unknown", requestId, {
        generation_id: generation.id,
        detail: truncate(detail, 300),
      }, Date.now() - t0);
      return NextResponse.json(
        { generation_id: generation.id, status: "submission_unknown", credits_used: cost, balance: newBalance },
        { status: 202 }
      );
    };
    const nextPollAt = () =>
      new Date(Date.now() + PROVIDER_POLL_INTERVAL_SECONDS * 1000).toISOString();

    // Chamar PiAPI
    try {
      // ── P11a — Atlas runtime (aditivo): profile → generateVideo → prediction ──
      if (atlasRuntime) {
        // §4 — webhook per-task (callback_token opaco). Completion via webhook Atlas
        // (Ed25519/JWKS) sem depender do browser; Predictions/poll continua fallback.
        const atlasWebhookUrl = process.env.PUBLIC_BASE_URL
          ? `${process.env.PUBLIC_BASE_URL}/api/webhooks/atlas/${callbackToken}`
          : null;
        // ROUTE-CERTIFICATION-01 — campos AVANÇADOS por model/mode (server-trusted).
        // Só entram no input os declarados em params.supported_params_by_mode[mode]
        // (ou supported_params). Valores vêm do body mas são VALIDADOS no profile (tipo)
        // + aqui (suporte por modo) — evita "unsupported property exposed". generate_audio
        // só p/ audio_mode=toggle (usuário controla); native (always) não envia toggle falso.
        const supportedParams: string[] = (() => {
          const byMode = atlasParams.supported_params_by_mode as Record<string, string[]> | undefined;
          if (byMode && Array.isArray(byMode[atlasMode])) return byMode[atlasMode];
          return Array.isArray(atlasParams.supported_params) ? (atlasParams.supported_params as string[]) : [];
        })();
        const sup = (k: string) => supportedParams.includes(k);
        const atlasAdvanced: Record<string, unknown> = {};
        if (sup("seed") && typeof seed === "number") atlasAdvanced.seed = Math.trunc(seed);
        if (sup("negative_prompt") && typeof negative_prompt === "string" && negative_prompt.trim())
          atlasAdvanced.negative_prompt = negative_prompt.trim();
        if (sup("camera_fixed") && typeof body?.camera_fixed === "boolean") atlasAdvanced.camera_fixed = body.camera_fixed;
        if (sup("prompt_expansion") && typeof body?.prompt_expansion === "boolean") atlasAdvanced.prompt_expansion = body.prompt_expansion;
        if (sup("cfg_scale") && typeof body?.cfg_scale === "number") atlasAdvanced.cfg_scale = body.cfg_scale;
        // Gemini Omni Flash — thinking_level é STRING ENUM ("default"|"low"|"high"). NÃO inteiro.
        // GEMINI-STANDARD-CONTRACT-FIX-01 §2 — qualquer outro valor → 400 PRÉ-DÉBITO.
        if (sup("thinking_level") && body?.thinking_level !== undefined) {
          if (!(THINKING_LEVELS as readonly string[]).includes(body.thinking_level as string)) {
            return NextResponse.json({ error: 'thinking_level deve ser "default", "low" ou "high".' }, { status: 400 });
          }
          atlasAdvanced.thinking_level = body.thinking_level;
        }
        if (sup("generate_audio") && atlasParams.audio_mode === "toggle" && typeof with_audio === "boolean")
          atlasAdvanced.generate_audio = with_audio;
        // §1 — Grok voice_ids: valida contra os presets OFICIAIS + limite 3 (400 pré-débito).
        if (sup("voice_ids") && body?.voice_ids !== undefined) {
          const vv = validateVoiceIds(body.voice_ids);
          if (!vv.ok) {
            return NextResponse.json({ error: vv.error }, { status: 400 });
          }
          if (vv.value && vv.value.length > 0) atlasAdvanced.voice_ids = vv.value;
        }
        // §2–§8 — Kling 4K/O3: sound/cfg_scale/negative_prompt/multi_shot/shot_type/
        // multi_prompt/elements. Valida shape/limites (sum shots == duração; cfg 0..1;
        // elements shape) e monta o payload EXATO. 400 PRÉ-DÉBITO em qualquer violação.
        if (sup("multi_shot") || sup("sound") || sup("elements")) {
          const kl = buildKlingAdvanced(
            {
              sound: sup("sound") ? body?.sound : undefined,
              cfg_scale: sup("cfg_scale") ? body?.cfg_scale : undefined,
              negative_prompt: sup("negative_prompt") ? negative_prompt : undefined,
              multi_shot: sup("multi_shot") ? body?.multi_shot : undefined,
              shot_type: sup("multi_shot") ? body?.shot_type : undefined,
              multi_prompt: sup("multi_shot") ? body?.multi_prompt : undefined,
              elements: sup("elements") ? body?.elements : undefined,
            },
            typeof duration === "number" ? duration : 0,
            { elementsMax: Number(atlasParams.max_reference_images) || 4 }
          );
          if (!kl.ok) {
            auditLog("api.generate.video", "kling_advanced_invalido_400", requestId, {
              model_id: aiModel.model_id,
              error: kl.error,
            });
            return NextResponse.json({ error: kl.error }, { status: 400 });
          }
          Object.assign(atlasAdvanced, kl.body);
        }

        const dispatch = await submitAtlasGeneration({
          contractId: atlasParams.atlas_contract as string,
          atlasModel: atlasParams.atlas_model as string,
          mode: atlasMode,
          atlasModelsByMode: (atlasParams.atlas_models_by_mode as Record<string, string>) || null,
          transform: {
            fieldMap: (atlasParams.payload_field_map as Record<string, string>) || null,
            refersField: (atlasParams.refers_field as string) || null,
            refersAsObjects: atlasParams.refers_as_objects === true,
          },
          webhookUrl: atlasWebhookUrl,
          input: {
            prompt: promptEn,
            aspect_ratio,
            duration: typeof duration === "number" ? duration : undefined,
            resolution: typeof resolution === "string" ? resolution : undefined,
            image_url: typeof start_image_url === "string" ? start_image_url : undefined,
            end_image_url: typeof end_image_url === "string" ? end_image_url : undefined,
            // §17 — reference mixto (H3) usa o conjunto combinado validado; demais usam imagens.
            refers: atlasReferenceRefs && atlasReferenceRefs.length > 0
              ? atlasReferenceRefs
              : Array.isArray(reference_image_urls)
                ? reference_image_urls
                : Array.isArray(reference_images)
                  ? reference_images
                  : undefined,
            ...atlasAdvanced,
          },
        });
        if (!dispatch.ok || !dispatch.pollRef) {
          // Falha determinística do provider → estorno+failed. Ambígua → submission_unknown.
          if (classifySubmitError(dispatch.error) === "ambiguous") {
            return await markSubmissionUnknown(dispatch.error || "Atlas submit ambíguo");
          }
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
        await service
          .from("generations")
          .update({ provider_task_id: dispatch.pollRef, status: "processing", next_provider_poll_at: nextPollAt() })
          .eq("id", generation.id);
        return NextResponse.json({
          generation_id: generation.id,
          task_id: dispatch.pollRef,
          credits_used: cost,
          balance: newBalance,
        });
      }

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
        // ETAPA 7.3.2 — Veo 3.1 reference images (slot dedicado) + seed (t2v).
        veoReferenceImages: Array.isArray(reference_image_urls) ? reference_image_urls : undefined,
        seed: typeof seed === "number" ? seed : undefined,
        // ETAPA 7.5.2 — Wan capabilities (o adapter só usa no ramo Wan).
        wanShotType: shot_type === "single" || shot_type === "multi" ? shot_type : undefined,
        wanPromptExtend: typeof prompt_extend === "boolean" ? prompt_extend : undefined,
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

      await service
        .from("generations")
        .update({ provider_task_id: task.data.task_id, status: "processing", next_provider_poll_at: nextPollAt() })
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
      // §7 — submit AMBÍGUO (rede/timeout/HTML/5xx): a task pode ter sido criada.
      // NÃO reenviar, NÃO estornar; submission_unknown + janela de reconciliação.
      if (classifySubmitError(apiError) === "ambiguous") {
        return await markSubmissionUnknown(errMsg);
      }
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
