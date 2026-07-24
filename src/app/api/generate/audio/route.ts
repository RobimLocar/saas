import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAudio } from "@/lib/piapi/client";
import { planAllows } from "@/lib/plans";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, model_uuid, duration, voice_id, language } = body;

    if (!prompt || !model_uuid) {
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
      return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 });
    }

    // Verificar créditos e plano
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits_balance < aiModel.credit_cost) {
      return NextResponse.json(
        { error: "Créditos insuficientes", required: aiModel.credit_cost, available: profile?.credits_balance || 0 },
        { status: 402 }
      );
    }

    // Gating por plano mínimo do modelo
    if (!planAllows(profile.plan, aiModel.min_plan)) {
      return NextResponse.json(
        { error: `Este modelo requer o plano ${aiModel.min_plan}` },
        { status: 403 }
      );
    }

    // Deduzir créditos
    const newBalance = profile.credits_balance - aiModel.credit_cost;
    await supabase
      .from("profiles")
      .update({ credits_balance: newBalance })
      .eq("id", user.id);

    // Criar geração
    const { data: generation } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        model_id: aiModel.id,
        type: "audio",
        prompt,
        params: { duration, voice_id, language },
        status: "pending",
        credits_used: aiModel.credit_cost,
      })
      .select()
      .single();

    if (!generation) {
      await supabase.from("profiles").update({ credits_balance: profile.credits_balance }).eq("id", user.id);
      return NextResponse.json({ error: "Erro ao registrar geração" }, { status: 500 });
    }

    // Ledger de créditos
    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -aiModel.credit_cost,
      reason: "generation",
      related_job_id: generation.id,
    });

    try {
      const modelParams = (aiModel.params as Record<string, string>) || {};
      // O catálogo exibido pode mapear para um backend PiAPI real diferente
      // do slug de exibição (params.backend: "Qubico/ace-step")
      const task = await generateAudio({
        model: modelParams.backend || aiModel.model_id,
        prompt,
        duration,
      });

      await supabase
        .from("generations")
        .update({ provider_task_id: task.data.task_id, status: "processing" })
        .eq("id", generation.id);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: task.data.task_id,
        credits_used: aiModel.credit_cost,
        balance: newBalance,
      });
    } catch (apiError) {
      await supabase.from("profiles").update({ credits_balance: profile.credits_balance }).eq("id", user.id);
      await supabase.from("generations").update({ status: "failed", error_message: String(apiError) }).eq("id", generation.id);
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: aiModel.credit_cost,
        reason: "refund",
        related_job_id: generation.id,
      });

      return NextResponse.json({ error: "Erro ao chamar provedor de IA" }, { status: 502 });
    }
  } catch (err) {
    console.error("[generate/audio] Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
