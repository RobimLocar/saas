import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Provedores que estão realmente integrados e funcionando hoje
const WORKING_PROVIDERS = ["piapi"];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const type = req.nextUrl.searchParams.get("type"); // image | video | audio | null

    let query = supabase
      .from("ai_models")
      .select(
        "id, name, provider, type, model_id, credit_cost, params, min_plan, thumbnail_url, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (type) query = query.eq("type", type);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const models = (data || []).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      type: m.type,
      model_id: m.model_id,
      credit_cost: m.credit_cost,
      min_plan: m.min_plan,
      family:
        (m.params as { family?: string } | null)?.family ||
        m.provider ||
        "Outros",
      thumbnail_url: m.thumbnail_url,
      // Indica se o modelo está integrado e pronto para gerar
      available: WORKING_PROVIDERS.includes(m.provider),
    }));

    return NextResponse.json({ models });
  } catch (err) {
    console.error("[api/models] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
