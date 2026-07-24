import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/piapi/client";

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

    // Buscar modelo e custo em créditos
    const { data: aiModel, error: modelError } = await supabase
      .from("ai_models")
      .select("*")
      .eq("slug", model_slug)
      .eq("is_active", true)
      .single();

    if (modelError || !aiModel) {
      return NextResponse.json(
        { error: "Modelo não encontrado ou inativo" },
        { status: 404 }
      );
    }

    // Verificar créditos do usuário
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
        modality: "image" as const,
        prompt,
        negative_prompt,
        params: { aspect_ratio, width, height, reference_image_url },
        status: "pending" as const,
        credits_charged: aiModel.credit_cost,
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

    // Registrar transação de créditos
    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      type: "usage" as const,
      amount: -aiModel.credit_cost,
      balance_after: newBalance,
      description: `Geração de imagem — ${aiModel.name}`,
      generation_id: generation.id,
    });

    // Chamar PiAPI
    try {
      const task = await generateImage({
        model: aiModel.provider_model_id,
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
          provider_task_id: task.task_id,
          status: "processing" as const,
        })
        .eq("id", generation.id);

      return NextResponse.json({
        generation_id: generation.id,
        task_id: task.task_id,
        credits_used: aiModel.credit_cost,
        balance: newBalance,
      });
    } catch (apiError) {
      // Reverter créditos em caso de erro na API
      await supabase
        .from("profiles")
        .update({ credits_balance: profile.credits_balance })
        .eq("id", user.id);

      await supabase
        .from("generations")
        .update({ status: "failed" as const, error_message: String(apiError) })
        .eq("id", generation.id);

      // Reverter transação
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        type: "refund" as const,
        amount: aiModel.credit_cost,
        balance_after: profile.credits_balance,
        description: `Reembolso — falha na geração de imagem`,
        generation_id: generation.id,
      });

      return NextResponse.json(
        { error: "Erro ao chamar provedor de IA" },
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
