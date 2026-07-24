import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTaskStatus, extractResultUrl, extractVideoUrl } from "@/lib/piapi/client";

/**
 * GET /api/generate/status?id=<generation_id>
 * Polling de status de uma geração — consulta a PiAPI se ainda processing,
 * baixa a mídia para o Supabase Storage (bucket "assets") e marca como concluída.
 * O feed do Studio lê diretamente da tabela `generations`.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const generationId = req.nextUrl.searchParams.get("id");
    if (!generationId) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const { data: generation } = await supabase
      .from("generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();

    if (!generation) {
      return NextResponse.json({ error: "Geração não encontrada" }, { status: 404 });
    }

    // Se já tem resultado final, retornar direto
    if (generation.status === "completed" || generation.status === "failed") {
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

    try {
      const taskStatus = await getTaskStatus(generation.provider_task_id);
      const state = taskStatus.data?.status;

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
          return NextResponse.json({ status: "processing" });
        }

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

          const mediaRes = await fetch(providerUrl);
          const mediaBuffer = await mediaRes.arrayBuffer();

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
          } else {
            const { data: publicData } = service.storage
              .from("assets")
              .getPublicUrl(storagePath);
            if (publicData?.publicUrl) finalUrl = publicData.publicUrl;
          }
        } catch (storageErr) {
          console.warn("[status] Erro no Storage, usando URL do provider:", storageErr);
        }

        await service
          .from("generations")
          .update({
            status: "completed",
            result_url: finalUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        return NextResponse.json({ status: "completed", result_url: finalUrl });
      }

      if (state === "failed") {
        // taskStatus.data.error é um objeto {code, message, ...} — extrair texto legível
        const rawErr = taskStatus.data?.error as
          | { message?: string; raw_message?: string; code?: number }
          | string
          | undefined;
        const errMsg =
          typeof rawErr === "string"
            ? rawErr
            : rawErr?.message || rawErr?.raw_message || JSON.stringify(rawErr) || "Erro no provedor";

        await service
          .from("generations")
          .update({
            status: "failed",
            error_message: String(errMsg),
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        // Reembolsar créditos automaticamente
        const { data: profile } = await service
          .from("profiles")
          .select("credits_balance")
          .eq("id", user.id)
          .single();

        if (profile) {
          await service
            .from("profiles")
            .update({ credits_balance: profile.credits_balance + generation.credits_used })
            .eq("id", user.id);

          await service.from("credit_transactions").insert({
            user_id: user.id,
            amount: generation.credits_used,
            reason: "refund",
            related_job_id: generation.id,
          });
        }

        return NextResponse.json({ status: "failed", error_message: String(errMsg) });
      }

      return NextResponse.json({ status: state || "processing" });
    } catch (err) {
      console.warn("[status] Erro ao consultar PiAPI:", err);
      return NextResponse.json({ status: "processing" });
    }
  } catch (err) {
    console.error("[generate/status] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
