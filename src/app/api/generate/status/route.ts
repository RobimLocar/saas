import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTaskStatus, extractResultUrl, extractVideoUrl } from "@/lib/piapi/client";
import { refundCredits } from "@/lib/credits";
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
    const timeoutMin = Number(process.env.GENERATION_TIMEOUT_MINUTES) || 30;
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
      auditLog("api.generate.status", "timeout_estorno", requestId, {
        generation_id: generation.id,
        idade_min: Math.round(ageMs / 60000),
        limite_min: timeoutMin,
      }, Date.now() - t0);
      return NextResponse.json({ status: "failed", error_message: errMsg });
    };

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
        // Imagem/áudio: extrator genérico.
        const genParams =
          (generation.params as Record<string, unknown> | null) || {};
        const outputKey =
          typeof genParams.output_key === "string"
            ? genParams.output_key
            : undefined;
        const providerUrl =
          generation.type === "video"
            ? extractVideoUrl(taskStatus.data.output, outputKey)
            : extractResultUrl(taskStatus.data.output);
        if (!providerUrl) {
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
          provider_url: truncate(providerUrl, 300),
        }, Date.now() - t0);

        // Baixar a mídia e persistir no Supabase Storage
        let finalUrl = providerUrl;
        try {
          const ext =
            generation.type === "image"
              ? "png"
              : generation.type === "video"
              ? "mp4"
              : "mp3";
          const storagePath = `${user.id}/${generation.type}/${generation.id}.${ext}`;

          const tDl = Date.now();
          const mediaRes = await fetch(providerUrl);
          const mediaBuffer = await mediaRes.arrayBuffer();
          auditLog("api.generate.status", "download_concluido", requestId, {
            generation_id: generation.id,
            http_status: mediaRes.status,
            bytes: mediaBuffer.byteLength,
            content_type: mediaRes.headers.get("content-type"),
          }, Date.now() - tDl);

          const tUp = Date.now();

          const { error: uploadError } = await service.storage
            .from("assets")
            .upload(storagePath, Buffer.from(mediaBuffer), {
              contentType:
                mediaRes.headers.get("content-type") ||
                (generation.type === "image"
                  ? "image/png"
                  : generation.type === "video"
                  ? "video/mp4"
                  : "audio/mpeg"),
              upsert: true,
            });

          if (uploadError) {
            console.warn("[status] Upload falhou:", uploadError.message);
            auditLog("api.generate.status", "upload_storage_falhou", requestId, {
              generation_id: generation.id,
              storage_path: storagePath,
              error: uploadError.message,
            }, Date.now() - tUp);
          } else {
            auditLog("api.generate.status", "upload_storage_ok", requestId, {
              generation_id: generation.id,
              storage_path: storagePath,
            }, Date.now() - tUp);
            const { data: publicData } = service.storage
              .from("assets")
              .getPublicUrl(storagePath);
            if (publicData?.publicUrl) finalUrl = publicData.publicUrl;
          }
        } catch (storageErr) {
          console.warn("[status] Erro no Storage, usando URL do provider:", storageErr);
          auditLog("api.generate.status", "storage_excecao_fallback_provider", requestId, {
            generation_id: generation.id,
            error: storageErr instanceof Error ? storageErr.message : String(storageErr),
          }, Date.now() - t0);
        }

        await service
          .from("generations")
          .update({
            status: "completed",
            result_url: finalUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        // AUDIT: persistência concluída — geração marcada completed
        auditLog("api.generate.status", "persistencia_completed", requestId, {
          generation_id: generation.id,
          result_url: truncate(finalUrl, 300),
        }, Date.now() - t0);

        return NextResponse.json({ status: "completed", result_url: finalUrl });
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

        // AUDIT: falha persistida + créditos estornados
        auditLog("api.generate.status", "falha_persistida_estorno", requestId, {
          generation_id: generation.id,
          error_message: String(errMsg),
          creditos_estornados: generation.credits_used,
        }, Date.now() - t0);

        return NextResponse.json({ status: "failed", error_message: String(errMsg) });
      }

      // Ainda processando na PiAPI: se estourou o tempo, encerra e estorna.
      const timedOut = await timeoutIfStale();
      if (timedOut) return timedOut;

      auditLog("api.generate.status", "ainda_processando", requestId, {
        generation_id: generation.id,
        piapi_state: state,
      }, Date.now() - t0);
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
