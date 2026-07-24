import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTaskStatus, extractResultUrl } from "@/lib/piapi/client";

/**
 * GET /api/generate/status?id=<generation_id>
 * Polling de status de uma geração — chama PiAPI se ainda processing
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

    // Se ainda processing, checar status no PiAPI
    if (generation.provider_task_id) {
      try {
        const taskStatus = await getTaskStatus(generation.provider_task_id);

        if (taskStatus.status === "completed") {
          const resultUrl = extractResultUrl(taskStatus.output);

          await supabase
            .from("generations")
            .update({
              status: "completed",
              result_url: resultUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", generation.id);

          // Criar asset na biblioteca do usuário
          if (resultUrl) {
            await supabase.from("assets").insert({
              user_id: user.id,
              category: generation.type,
              name: (generation.prompt || "Geração").slice(0, 60),
              image_url: resultUrl,
            });
          }

          return NextResponse.json({ status: "completed", result_url: resultUrl });
        }

        if (taskStatus.status === "failed") {
          await supabase
            .from("generations")
            .update({
              status: "failed",
              error_message: taskStatus.error || "Erro no provedor",
              updated_at: new Date().toISOString(),
            })
            .eq("id", generation.id);

          return NextResponse.json({
            status: "failed",
            error_message: taskStatus.error,
          });
        }

        return NextResponse.json({ status: taskStatus.status || "processing" });
      } catch {
        return NextResponse.json({ status: "processing" });
      }
    }

    return NextResponse.json({ status: generation.status });
  } catch (err) {
    console.error("[generate/status] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
