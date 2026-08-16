import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { submitImageToolkitTask } from "@/lib/piapi/client";

const RMBG_MODELS = ["RMBG-2.0", "RMBG-1.4", "BEN2"];

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const imageUrl = typeof body?.image_url === "string" ? body.image_url : "";
    const rmbgModel = RMBG_MODELS.includes(body?.rmbg_model) ? body.rmbg_model : "RMBG-2.0";
    if (!/^https?:\/\//i.test(imageUrl)) {
      return NextResponse.json({ error: "Conecte uma imagem válida (URL pública)." }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: model } = await supabase
      .from("ai_models")
      .select("id, credit_cost")
      .eq("type", "image").eq("provider", "piapi").eq("params->>kind", "removebg")
      .limit(1).single();
    if (!model) return NextResponse.json({ error: "Modelo Remove BG não configurado" }, { status: 500 });

    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
    const cost = effectiveCost(model.credit_cost, profile?.plan ?? "free");

    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({ user_id: user.id, model_id: model.id, type: "image", prompt: "Remove background", params: { kind: "removebg", rmbg_model: rmbgModel, source: imageUrl }, status: "pending", credits_used: cost })
      .select().single();
    if (genError || !generation) return NextResponse.json({ error: "Erro ao registrar operação" }, { status: 500 });

    const debit = await debitCredits(service, user.id, cost, generation.id, requestId);
    if (!debit.ok) {
      await service.from("generations").update({ status: "failed", error_message: "Falha ao debitar créditos" }).eq("id", generation.id);
      if ("insufficient" in debit) return NextResponse.json({ error: "Créditos insuficientes", required: cost }, { status: 402 });
      return NextResponse.json({ error: debit.error }, { status: 500 });
    }

    try {
      const task = await submitImageToolkitTask({ taskType: "background-remove", input: { rmbg_model: rmbgModel, image: imageUrl } }, requestId);
      const taskId = task?.data?.task_id;
      if (!taskId) throw new Error("PiAPI não retornou task_id");
      await service.from("generations").update({ provider_task_id: taskId, status: "processing" }).eq("id", generation.id);
      return NextResponse.json({ generation_id: generation.id, status: "processing" });
    } catch (err) {
      await service.from("generations").update({ status: "failed", error_message: err instanceof Error ? err.message : "Falha na PiAPI" }).eq("id", generation.id);
      await refundCredits(service, user.id, generation.id, cost, requestId);
      return NextResponse.json({ error: "Falha ao iniciar Remove BG. Créditos estornados." }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
