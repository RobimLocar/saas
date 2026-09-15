import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMPTY_DEF = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };

// Lista os flows do usuário (sem o graph pesado).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { data, error } = await supabase
      .from("flows")
      .select("id, name, description, is_template, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ flows: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar flows." },
      { status: 500 }
    );
  }
}

// Cria um flow novo (vazio por padrão) e devolve com o graph.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name =
      typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Novo Flow";
    const definition =
      body?.definition && typeof body.definition === "object" ? body.definition : EMPTY_DEF;

    const { data, error } = await supabase
      .from("flows")
      .insert({ user_id: user.id, name, definition })
      .select("id, name, description, is_template, definition, created_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ flow: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar flow." },
      { status: 500 }
    );
  }
}
