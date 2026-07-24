import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/generations — lista as gerações do usuário (todas as modalidades)
 * Inclui gerações em processamento para exibir o progresso no Studio.
 * Query params: ?type=image|video|audio &limit=60
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

    const type = req.nextUrl.searchParams.get("type");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "60");

    let query = supabase
      .from("generations")
      .select(
        "id, type, prompt, status, result_url, error_message, credits_used, created_at, params, ai_models(name, model_id)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type && type !== "all") {
      query = query.eq("type", type);
    }

    const { data: generations, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const normalized = (generations || []).map((g) => ({
      id: g.id,
      type: g.type,
      prompt: g.prompt,
      status: g.status,
      result_url: g.result_url,
      error_message: g.error_message,
      credits_used: g.credits_used,
      created_at: g.created_at,
      params: (g.params as { aspect_ratio?: string } | null) || null,
      model_label: (g.ai_models as { name?: string } | null)?.name || null,
      model_slug: (g.ai_models as { model_id?: string } | null)?.model_id || null,
    }));

    return NextResponse.json({ generations: normalized });
  } catch (err) {
    console.error("[generations] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
