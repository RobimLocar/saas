import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { submitImageToolkitTask } from "@/lib/piapi/client";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const imageUrl = typeof body?.image_url === "string" ? body.image_url : "";
    const scale = body?.scale === 4 ? 4 : 2;
    const faceEnhance = body?.face_enhance === true;
    if (!/^https?:\/\//i.test(imageUrl)) {
      return NextResponse.json({ error: "Conecte uma imagem válida (URL pública)." }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: model } = await supabase
      .from("ai_models")
      .select("id, credit_cost")
      .eq("type", "image").eq("provider", "piapi").eq("params->>kind", "upscale")
      .limit(1).single();
    if (!model) return NextResponse.json({ error: "Modelo Upscale não configurado" }, { status: 500 });

    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
    // custo escala com o fator (4x processa 4x mais pixels que 2x → ~2x o custo base)
    const cost = effectiveCost(model.credit_cost, profile?.plan ?? "free") * (scale === 4 ? 2 : 1);

    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({ user_id: user.id, model_id: model.id, type: "image", prompt: `Upscale ${scale}x`, params: { kind: "upscale", scale, face_enhance: faceEnhance, source: imageUrl }, status: "pending", credits_used: cost })
      .select().single();
    if (genError || !generation) return NextResponse.json({ error: "Erro ao registrar operação" }, { status: 500 });

    const debit = await debitCredits(service, user.id, cost, generation.id, requestId);
    if (!debit.ok) {
      await service.from("generations").update({ status: "failed", error_message: "Falha ao debitar créditos" }).eq("id", generation.id);
      if ("insufficient" in debit) return NextResponse.json({ error: "Créditos insuficientes", required: cost }, { status: 402 });
      return NextResponse.json({ error: debit.error }, { status: 500 });
    }

    try {
      const task = await submitImageToolkitTask({ taskType: "upscale", input: { image: imageUrl, scale, face_enhance: faceEnhance } }, requestId);
      const taskId = task?.data?.task_id;
      if (!taskId) throw new Error("PiAPI não retornou task_id");
      await service.from("generations").update({ provider_task_id: taskId, status: "processing" }).eq("id", generation.id);
      return NextResponse.json({ generation_id: generation.id, status: "processing" });
    } catch (err) {
      await service.from("generations").update({ status: "failed", error_message: err instanceof Error ? err.message : "Falha na PiAPI" }).eq("id", generation.id);
      await refundCredits(service, user.id, generation.id, cost, requestId);
      return NextResponse.json({ error: "Falha ao iniciar Upscale. Créditos estornados." }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
