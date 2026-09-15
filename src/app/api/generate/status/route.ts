import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTaskStatus, extractResultUrls } from "@/lib/piapi/client";
import { persistProviderOutputs } from "@/lib/media/persist-result";
import { refundCredits } from "@/lib/credits";
import { markFreeImageTrialUsed, releaseFreeImageTrial } from "@/lib/trials";
import { isAtlasRuntime, pollAtlasGeneration } from "@/lib/atlas/dispatch";
import { drainWebhookEvents } from "@/lib/webhooks/processor";
import { PROVIDER_POLL_INTERVAL_SECONDS } from "@/lib/webhooks/reliability-runtime";
import { auditLog, newRequestId, truncate } from "@/lib/audit-log";

/**
 * GET /api/generate/status?id=<generation_id>
 * Polling de status de uma geração — consulta a PiAPI se ainda processing,
 * baixa a mídia para o Supabase Storage (bucket "assets") e marca como concluída.
 * O feed do Studio lê diretamente da tabela `generations`.
 */
export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      auditLog("api.generate.status", "auth_falhou_401", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const generationId = req.nextUrl.searchParams.get("id");
    if (!generationId) {
      auditLog("api.generate.status", "validacao_falhou_400", requestId, {}, Date.now() - t0);
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    // AUDIT: entrada do polling de status
    auditLog("api.generate.status", "entrada", requestId, {
      user_id: user.id,
      generation_id: generationId,
    });

    const { data: generation } = await supabase
      .from("generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();

    if (!generation) {
      auditLog("api.generate.status", "generation_nao_encontrada_404", requestId, {
        generation_id: generationId,
      }, Date.now() - t0);
      return NextResponse.json({ error: "Geração não encontrada" }, { status: 404 });
    }

    // GROWTH-02 — geração do teste grátis? (marca USED em sucesso durável; devolve
    // o trial em falha/timeout). Vínculo por generation_id (não depende do browser).
    const isTrial =
      ((generation.params as Record<string, unknown> | null)?.free_trial as boolean) === true;

    // Se já tem resultado final, retornar direto
    if (generation.status === "completed" || generation.status === "failed") {
      auditLog("api.generate.status", "estado_final_cacheado", requestId, {
        generation_id: generationId,
        status: generation.status,
      }, Date.now() - t0);
      return NextResponse.json({
        status: generation.status,
        result_url: generation.result_url,
        error_message: generation.error_message,
      });
    }

    if (!generation.provider_task_id) {
      return NextResponse.json({ status: generation.status });
    }

    // Cliente com service role para Storage + escrita (ignora RLS)
    const service = createServiceClient();

    // BLOCO 4 (§3.4): timeout de gerações presas. Se a geração está há mais de
    // GENERATION_TIMEOUT_MINUTES (default 30) sem concluir, marca como failed e
    // estorna (idempotente). Evita créditos travados quando o provider não responde.
    // VIDEO-RELIABILITY-01 — FAILSAFE de STUCK (não de SLOW). Só é alcançado no
    // caminho provider-INALCANÇÁVEL. Um job válido que o provider reporta
    // pending/processing NUNCA falha por tempo decorrido (Seedance pode enfileirar
    // horas; Atlas encerra+estorna seus próprios timeouts). Default = 24h.
    const timeoutMin = Number(process.env.GENERATION_TIMEOUT_MINUTES) || 1440;
    const ageMs = Date.now() - new Date(generation.created_at).getTime();
    const isStale = Number.isFinite(ageMs) && ageMs > timeoutMin * 60_000;
    const timeoutIfStale = async (): Promise<NextResponse | null> => {
      if (!isStale) return null;
      const errMsg = `Geração expirou após ${timeoutMin} min sem conclusão do provider.`;
      await service
        .from("generations")
        .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
        .eq("id", generation.id);
      await refundCredits(service, user.id, generation.id, generation.credits_used, requestId);
      if (isTrial) await releaseFreeImageTrial(service, generation.id); // devolve o teste grátis
      auditLog("api.generate.status", "timeout_estorno", requestId, {
        generation_id: generation.id,
        idade_min: Math.round(ageMs / 60000),
        limite_min: timeoutMin,
      }, Date.now() - t0);
      return NextResponse.json({ status: "failed", error_message: errMsg });
    };

    // §7 — submission_unknown: submissão ambígua. Reconciliação SEM reenvio:
    //  • provider_task_id apareceu (webhook por callback_token setou) → segue p/ poll;
    //  • sem task_id, dentro da janela → ainda processando (aguarda webhook);
    //  • sem task_id, janela expirada → estorno idempotente + failed (SUBMISSION_UNKNOWN_TIMEOUT).
    if (generation.status === "submission_unknown" && !generation.provider_task_id) {
      const gp = (generation.params as Record<string, unknown> | null) || {};
      const deadline =
        typeof gp.submission_deadline === "string" ? Date.parse(gp.submission_deadline) : NaN;
      if (Number.isFinite(deadline) && Date.now() > deadline) {
        const errMsg =
          "A geração não pôde ser confirmada no provedor. Seus créditos foram estornados.";
        await service
          .from("generations")
          .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
          .eq("id", generation.id);
        await refundCredits(service, user.id, generation.id, generation.credits_used, requestId);
        if (isTrial) await releaseFreeImageTrial(service, generation.id);
        auditLog("api.generate.status", "submission_unknown_timeout_estorno", requestId, {
          generation_id: generation.id,
        }, Date.now() - t0);
        return NextResponse.json({ status: "failed", error_message: errMsg });
      }
      return NextResponse.json({ status: "processing" });
    }

    // §5 — drain OPORTUNISTA do inbox: se um webhook já entregou o resultado desta
    // (ou de qualquer) geração, aplica P8/P7 agora e o usuário vê a conclusão no
    // próximo poll — mesmo sem o cron. Best-effort; nunca bloqueia o status.
    try {
      await drainWebhookEvents(service, { limit: 5, requestId });
    } catch {
      /* best-effort */
    }
    {
      const { data: fresh } = await service
        .from("generations")
        .select("status, result_url, error_message")
        .eq("id", generation.id)
        .single();
      if (fresh && (fresh.status === "completed" || fresh.status === "failed")) {
        return NextResponse.json({
          status: fresh.status,
          result_url: fresh.result_url,
          error_message: fresh.error_message,
        });
      }
    }

    // §6 — THROTTLE: o servidor NÃO consulta o provider a cada browser poll. Só faz
    // GET quando next_provider_poll_at vence. Webhook-enabled ⇒ ~0 polls no provider.
    if (generation.next_provider_poll_at) {
      const due = Date.parse(generation.next_provider_poll_at as string);
      if (Number.isFinite(due) && Date.now() < due) {
        return NextResponse.json({ status: generation.status });
      }
    }
    const bumpNextPoll = async () => {
      await service
        .from("generations")
        .update({
          next_provider_poll_at: new Date(
            Date.now() + PROVIDER_POLL_INTERVAL_SECONDS * 1000
          ).toISOString(),
        })
        .eq("id", generation.id);
    };

    // ── P11a — Atlas runtime: poll COMPARTILHADO + entrega P8 (mídia) ou texto ──
    // Aditivo e gated: gerações PiAPI (sem runtime_provider) seguem intactas abaixo.
    if (isAtlasRuntime(generation.params as Record<string, unknown> | null)) {
      try {
        const pred = await pollAtlasGeneration(generation.provider_task_id);
        if (pred.status === "failed") {
          const errMsg = `O provider rejeitou a solicitação: ${pred.error || "erro"}`;
          await service
            .from("generations")
            .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
            .eq("id", generation.id);
          await refundCredits(service, user.id, generation.id, generation.credits_used, requestId);
          return NextResponse.json({ status: "failed", error_message: errMsg });
        }
        if (pred.status === "completed" && pred.outputs.length > 0) {
          const genParams = (generation.params as Record<string, unknown> | null) || {};
          // Saída de TEXTO (ASR/lyrics): não persiste mídia, guarda o texto.
          if (genParams.atlas_output_kind === "text") {
            await service
              .from("generations")
              .update({
                status: "completed",
                updated_at: new Date().toISOString(),
                params: { ...genParams, result_text: pred.outputs[0] },
              })
              .eq("id", generation.id);
            return NextResponse.json({ status: "completed", result_text: pred.outputs[0] });
          }
          // Saída de MÍDIA → P8 durável (all-or-nothing), NUNCA URL do provider.
          const persisted = await persistProviderOutputs(service, {
            userId: user.id,
            generationId: generation.id,
            type: generation.type,
            providerUrls: pred.outputs,
          });
          if (!persisted.ok) {
            const errMsg =
              "Não foi possível salvar o resultado da geração. Seus créditos foram estornados.";
            await service
              .from("generations")
              .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
              .eq("id", generation.id);
            await refundCredits(service, user.id, generation.id, generation.credits_used, requestId);
            return NextResponse.json({ status: "failed", error_message: errMsg });
          }
          await service
            .from("generations")
            .update({ status: "completed", result_url: persisted.urls[0], updated_at: new Date().toISOString() })
            .eq("id", generation.id);
          return NextResponse.json({ status: "completed", result_url: persisted.urls[0] });
        }
        // Provider ainda processando (SLOW, não STUCK) → manter vivo, sem falhar por tempo.
        await bumpNextPoll();
        return NextResponse.json({ status: "processing" });
      } catch (e) {
        auditLog("api.generate.status", "atlas_poll_erro", requestId, {
          generation_id: generation.id,
          error: e instanceof Error ? e.message : String(e),
        });
        const timedOutAtlas = await timeoutIfStale();
        if (timedOutAtlas) return timedOutAtlas;
        return NextResponse.json({ status: "processing" });
      }
    }

    try {
      const taskStatus = await getTaskStatus(generation.provider_task_id, requestId);
      const state = taskStatus.data?.status;
      console.log(
        "[status] task_id=",
        generation.provider_task_id,
        "state=",
        state,
        "output_keys=",
        Object.keys(taskStatus.data?.output || {})
      );

      if (state === "completed") {
        // Vídeo: usa o output_key salvo no modelo (output.video vs output.video_url).
        // Imagem/áudio: extrator genérico. P5g1 — extractResultUrls devolve TODAS
        // as URLs (hoje ≤1; N quando um provider multi-output for ligado no P5g).
        const genParams =
          (generation.params as Record<string, unknown> | null) || {};
        const outputKey =
          typeof genParams.output_key === "string"
            ? genParams.output_key
            : undefined;
        const providerUrls = extractResultUrls(
          taskStatus.data.output,
          generation.type === "video",
          outputKey
        );
        if (providerUrls.length === 0) {
          console.warn(
            "[status] URL not extracted! output_key=",
            outputKey,
            "output=",
            JSON.stringify(taskStatus.data.output)
          );
          // AUDIT: task completa na PiAPI mas URL não extraída (output_key incorreto?)
          auditLog("api.generate.status", "url_nao_extraida", requestId, {
            generation_id: generation.id,
            output_key: outputKey,
            output: truncate(JSON.stringify(taskStatus.data.output), 2000),
          }, Date.now() - t0);
          return NextResponse.json({ status: "processing" });
        }

        // AUDIT: transição — task completed na PiAPI, iniciando download/persistência
        auditLog("api.generate.status", "task_completed_download_inicio", requestId, {
          generation_id: generation.id,
          outputs: providerUrls.length,
          provider_url: truncate(providerUrls[0], 300),
        }, Date.now() - t0);

        // P8a — Persistência DURÁVEL (all-or-nothing) via helper compartilhado.
        // Se QUALQUER output falhar em persistir no Storage do Fluxyra, a geração
        // vira `failed` + estorno (P7b idempotente) — NUNCA `completed` com URL
        // temporária do provider (que o PiAPI pode apagar).
        const persisted = await persistProviderOutputs(service, {
          userId: user.id,
          generationId: generation.id,
          type: generation.type,
          providerUrls,
        });

        if (!persisted.ok) {
          const errMsg =
            "Não foi possível salvar o resultado da geração. Seus créditos foram estornados.";
          await service
            .from("generations")
            .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
            .eq("id", generation.id);
          await refundCredits(service, user.id, generation.id, generation.credits_used, requestId);
          if (isTrial) await releaseFreeImageTrial(service, generation.id); // Storage falhou → devolve trial
          auditLog("api.generate.status", "persistencia_falhou_estorno", requestId, {
            generation_id: generation.id,
            error: persisted.error,
          }, Date.now() - t0);
          return NextResponse.json({ status: "failed", error_message: errMsg });
        }

        const storedUrls = persisted.urls;

        // Primary invariant: result_url = primeiro output armazenado (compat com
        // feed/histórico/consumidores antigos). result_urls (aditivo) só quando
        // há verdadeiro multi-output — não polui generations single com array de 1.
        const primaryUrl = storedUrls[0];
        const isMulti = storedUrls.length > 1;
        const updatePatch: Record<string, unknown> = {
          status: "completed",
          result_url: primaryUrl,
          updated_at: new Date().toISOString(),
        };
        if (isMulti) {
          // Merge ADITIVO: preserva toda a metadata existente (pricing/Udio/ACE/TTS).
          updatePatch.params = { ...genParams, result_urls: storedUrls };
        }

        await service
          .from("generations")
          .update(updatePatch)
          .eq("id", generation.id);

        // GROWTH-02 — imagem grátis entregue de forma DURÁVEL → trial USED permanente.
        if (isTrial) await markFreeImageTrialUsed(service, generation.id);

        // AUDIT: persistência concluída — geração marcada completed
        auditLog("api.generate.status", "persistencia_completed", requestId, {
          generation_id: generation.id,
          outputs: storedUrls.length,
          result_url: truncate(primaryUrl, 300),
        }, Date.now() - t0);

        return NextResponse.json({
          status: "completed",
          result_url: primaryUrl,
          ...(isMulti ? { result_urls: storedUrls } : {}),
        });
      }

      if (state === "failed") {
        // taskStatus.data.error é um objeto {code, message, ...} — extrair texto legível
        const rawErr = taskStatus.data?.error as
          | { message?: string; raw_message?: string; code?: number }
          | string
          | undefined;
        const providerMsg =
          typeof rawErr === "string"
            ? rawErr
            : rawErr?.message || rawErr?.raw_message || JSON.stringify(rawErr) || "Erro no provedor";

        // A PiAPI retorna a causa REAL da falha no array logs[] (o error.message
        // costuma ser genérico: "Internal error. Please try again later.").
        // Analisamos os logs para dar ao usuário uma mensagem PT-BR clara.
        const logs = taskStatus.data?.logs || [];
        console.log(
          "[status] FAILED task_id=",
          generation.provider_task_id,
          "provider_msg=",
          providerMsg,
          "logs=",
          JSON.stringify(logs)
        );

        // AUDIT: task falhou na PiAPI — registrar erro cru + logs[] completos
        auditLog("api.generate.status", "task_failed_piapi", requestId, {
          generation_id: generation.id,
          provider_task_id: generation.provider_task_id,
          provider_error: providerMsg,
          piapi_logs: logs,
        }, Date.now() - t0);

        // NÃO classificamos nem substituímos a mensagem do provedor por texto
        // interno. Preservamos SEMPRE a mensagem original (error.message +
        // logs[] concatenados quando houver), com um prefixo neutro em PT-BR.
        // A validação de conteúdo é responsabilidade exclusiva do provedor.
        const providerDetail = [providerMsg, ...logs]
          .map((s) => String(s).trim())
          .filter(Boolean)
          .join(" | ");
        const errMsg = providerDetail
          ? `O provider rejeitou a solicitação: ${providerDetail}`
          : "O provider rejeitou a solicitação.";

        await service
          .from("generations")
          .update({
            status: "failed",
            error_message: String(errMsg),
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        // Reembolsar créditos automaticamente — IDEMPOTENTE (§3.3): não estorna
        // duas vezes se o webhook também tratar a mesma falha.
        await refundCredits(service, user.id, generation.id, generation.credits_used, requestId);
        if (isTrial) await releaseFreeImageTrial(service, generation.id); // provider falhou → devolve trial

        // AUDIT: falha persistida + créditos estornados
        auditLog("api.generate.status", "falha_persistida_estorno", requestId, {
          generation_id: generation.id,
          error_message: String(errMsg),
          creditos_estornados: generation.credits_used,
        }, Date.now() - t0);

        return NextResponse.json({ status: "failed", error_message: String(errMsg) });
      }

      // Provider ainda processando (SLOW, não STUCK) → manter vivo, sem falhar por
      // tempo decorrido (o failsafe só se aplica quando o provider está inalcançável).
      auditLog("api.generate.status", "ainda_processando", requestId, {
        generation_id: generation.id,
        piapi_state: state,
      }, Date.now() - t0);
      await bumpNextPoll();
      return NextResponse.json({ status: state || "processing" });
    } catch (err) {
      console.warn("[status] Erro ao consultar PiAPI:", err);
      auditLog("api.generate.status", "erro_consulta_piapi", requestId, {
        generation_id: generation.id,
        error: err instanceof Error ? err.message : String(err),
      }, Date.now() - t0);
      // Mesmo com erro de consulta, aplica o timeout se a geração já está presa.
      const timedOut = await timeoutIfStale();
      if (timedOut) return timedOut;
      return NextResponse.json({ status: "processing" });
    }
  } catch (err) {
    console.error("[generate/status] Error:", err);
    auditLog("api.generate.status", "excecao_500", requestId, {
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
