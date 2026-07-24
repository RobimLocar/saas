import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Webhook do PiAPI — chamado quando uma task é concluída
 * Atualiza a geração no banco e cria o asset na biblioteca
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task_id, status, output, error } = body;

    if (!task_id) {
      return NextResponse.json({ error: "task_id obrigatório" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Buscar geração pelo provider_task_id
    const { data: generation } = await supabase
      .from("generations")
      .select("*")
      .eq("provider_task_id", task_id)
      .single();

    if (!generation) {
      console.warn(`[webhook/piapi] Geração não encontrada para task: ${task_id}`);
      return NextResponse.json({ ok: true });
    }

    // Task falhou
    if (status === "failed") {
      await supabase
        .from("generations")
        .update({
          status: "failed",
          error_message: error || "Erro no provedor de IA",
          updated_at: new Date().toISOString(),
        })
        .eq("id", generation.id);

      // Reembolsar créditos
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", generation.user_id)
        .single();

      if (profile) {
        const restored = profile.credits_balance + generation.credits_used;
        await supabase
          .from("profiles")
          .update({ credits_balance: restored })
          .eq("id", generation.user_id);

        await supabase.from("credit_transactions").insert({
          user_id: generation.user_id,
          amount: generation.credits_used,
          reason: "refund",
          related_job_id: generation.id,
        });
      }

      return NextResponse.json({ ok: true, action: "refunded" });
    }

    // Task concluída
    if (status === "completed" && output) {
      const resultUrl =
        output.url ||
        output.image_url ||
        output.video_url ||
        output.audio_url ||
        output.images?.[0]?.url ||
        output.videos?.[0]?.url;

      if (!resultUrl) {
        console.warn(`[webhook/piapi] Output sem URL para task: ${task_id}`);
        return NextResponse.json({ ok: true });
      }

      // Baixar mídia e persistir no Supabase Storage (bucket "assets")
      let storagePath = `${generation.user_id}/${generation.type}s/${generation.id}`;
      const ext = generation.type === "image" ? ".png" : generation.type === "video" ? ".mp4" : ".mp3";
      storagePath += ext;

      try {
        const mediaRes = await fetch(resultUrl);
        const mediaBuffer = await mediaRes.arrayBuffer();

        await supabase.storage
          .from("assets")
          .upload(storagePath, Buffer.from(mediaBuffer), {
            contentType: mediaRes.headers.get("content-type") || "application/octet-stream",
            upsert: true,
          });

        const { data: publicUrlData } = supabase.storage
          .from("assets")
          .getPublicUrl(storagePath);

        const publicUrl = publicUrlData.publicUrl;

        // Atualizar geração
        await supabase
          .from("generations")
          .update({
            status: "completed",
            result_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        // Criar asset na biblioteca
        await supabase.from("assets").insert({
          user_id: generation.user_id,
          category: generation.type,
          name: (generation.prompt || "Geração").slice(0, 60),
          image_url: publicUrl,
        });
      } catch {
        // Salvar URL direta do provider se falhar o upload
        await supabase
          .from("generations")
          .update({
            status: "completed",
            result_url: resultUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generation.id);

        await supabase.from("assets").insert({
          user_id: generation.user_id,
          category: generation.type,
          name: (generation.prompt || "Geração").slice(0, 60),
          image_url: resultUrl,
        });
      }

      return NextResponse.json({ ok: true, action: "completed" });
    }

    // Outros status (processing, pending) — apenas atualizar
    if (status && status !== generation.status) {
      await supabase
        .from("generations")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", generation.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook/piapi] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
