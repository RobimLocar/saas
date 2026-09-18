import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/assets?category=characters — lista assets do usuário para o painel "@"
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const category = req.nextUrl.searchParams.get("category");

    let query = supabase
      .from("assets")
      .select("id, name, category, image_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);

    if (category && category !== "all") query = query.eq("category", category);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assets: data || [] });
  } catch (err) {
    console.error("[api/assets] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
