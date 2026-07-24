import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/piapi/client";
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
    const { prompt, model_slug, negative_prompt, aspect_ratio, width, height, reference_image_url } = body;

    if (!prompt || !model_slug) {
      return NextResponse.json(
        { error: "Prompt e modelo são obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar modelo pelo identificador do provider (ai_models.model_id)
    const { data: aiModel, error: modelError } = await supabase
      .from("ai_models")
      .select("*")
      .eq("model_id", model_slug)
      .eq("is_active", true)
      .single();

    if (modelError || !aiModel) {
      return NextResponse.json(
        { error: "Modelo não encontrado ou inativo" },
        { status: 404 }
      );
    }

    // Verificar créditos e plano do usuário
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

    // Deduzir créditos (otimista)
    const newBalance = profile.credits_balance - aiModel.credit_cost;
    await supabase
      .from("profiles")
      .update({ credits_balance: newBalance })
      .eq("id", user.id);

    // Criar registro de geração
    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        model_id: aiModel.id,
        type: "image",
        prompt,
        negative_prompt,
        params: { aspect_ratio, width, height, reference_image_url },
        status: "pending",
        credits_used: aiModel.credit_cost,
      })
      .select()
      .single();

    if (genError || !generation) {
      // Reverter créditos
      await supabase
        .from("profiles")
        .update({ credits_balance: profile.credits_balance })
        .eq("id", user.id);
      return NextResponse.json(
        { error: "Erro ao registrar geração" },
        { status: 500 }
      );
    }

    // Registrar transação de créditos (ledger)
    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -aiModel.credit_cost,
      reason: "generation",
      related_job_id: generation.id,
    });

    // Chamar PiAPI
    try {
      const task = await generateImage({
        model: aiModel.model_id,
        prompt,
        negative_prompt,
        aspect_ratio,
        width,
        height,
        reference_image_url,
      });

      // Atualizar geração com task_id
      await supabase
        .from("generations")
        .update({
          provider_task_id: task.data.task_id,
          status: "processing",
        })
        .eq("id", generation.id);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: task.data.task_id,
        credits_used: aiModel.credit_cost,
        balance: newBalance,
      });
    } catch (apiError) {
      console.error("[PiAPI] Erro detalhado:", apiError);
      
      // Reverter créditos em caso de erro na API
      await supabase
        .from("profiles")
        .update({ credits_balance: profile.credits_balance })
        .eq("id", user.id);

      await supabase
        .from("generations")
        .update({ status: "failed", error_message: String(apiError) })
        .eq("id", generation.id);

      // Reembolso no ledger
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: aiModel.credit_cost,
        reason: "refund",
        related_job_id: generation.id,
      });

      return NextResponse.json(
        { error: "Erro ao chamar provedor de IA", details: String(apiError) },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("[generate/image] Error:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
