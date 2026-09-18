import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { effectiveCost } from "@/lib/credits";
import { resolveAtlasModelForMode, isAtlasRuntime } from "@/lib/atlas/dispatch";
import { cachedQuoteAtlas, atlasQuoteToRawCredits } from "@/lib/atlas/quote";

// FLUXYRA-AI-PRODUCTION-02 §6 — endpoint INTERNO de estimativa de custo para a UI
// de modelos Atlas com billing_mode="atlas_quote". O SERVIDOR resolve o provider
// model id e chama /calculate (cache curto); o browser NUNCA envia custo em USD.
// Retorna apenas créditos (base + effectiveCost do plano). Não cria task, não cobra.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { model_uuid, resolution, duration, reference_count, with_audio, mode } = body || {};
    if (!model_uuid) return NextResponse.json({ error: "model_uuid obrigatório" }, { status: 400 });

    const { data: aiModel } = await supabase
      .from("ai_models").select("*").eq("id", model_uuid).eq("is_active", true).single();
    if (!aiModel) return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 });

    const params = (aiModel.params as Record<string, unknown>) || {};
    if (!isAtlasRuntime(params) || params.billing_mode !== "atlas_quote") {
      // Modelo não usa quoted billing → a UI já tem cps/credit_cost; nada a estimar aqui.
      return NextResponse.json({ error: "Modelo não usa quoted billing" }, { status: 400 });
    }

    const providerModel = resolveAtlasModelForMode(
      params.atlas_model as string,
      (params.atlas_models_by_mode as Record<string, string>) || null,
      typeof mode === "string" ? mode : "text-to-video"
    );
    const quoteBody: Record<string, unknown> = { model: providerModel, prompt: "estimate" };
    if (typeof resolution === "string") quoteBody.resolution = resolution;
    if (typeof duration === "number") quoteBody.duration = duration;
    if (typeof with_audio === "boolean") quoteBody.generate_audio = with_audio;
    const n = Number(reference_count) || 0;
    if (n > 0) quoteBody.refers = Array.from({ length: Math.min(n, 10) }, () => "https://x/y.jpg");

    const q = await cachedQuoteAtlas(quoteBody);
    const conv = atlasQuoteToRawCredits(q, {
      estimatedSafetyFactor: Number(params.estimated_safety_factor) || 1.25,
    });
    if (!conv.ok) return NextResponse.json({ error: "Estimativa indisponível" }, { status: 503 });

    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
    const credits = effectiveCost(conv.rawCredits, profile?.plan ?? "free");
    return NextResponse.json({ credits, estimated: q.estimated });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
