import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LIST_FIELDS =
  "id, name, product_id, avatar_label, status, script, created_at, updated_at";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ugc_projects")
      .select(LIST_FIELDS)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ projects: data || [] });
  } catch (err) {
    console.error("[api/ugc/projects][GET] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const productId =
      typeof body?.product_id === "string" ? body.product_id.trim() || null : null;
    const avatarLabel =
      typeof body?.avatar_label === "string" ? body.avatar_label.trim() || null : null;

    if (!name) {
      return NextResponse.json({ error: "O campo name é obrigatório." }, { status: 400 });
    }

    const payload: {
      user_id: string;
      name: string;
      product_id?: string | null;
      avatar_label?: string | null;
      status: string;
    } = {
      user_id: user.id,
      name,
      status: "draft",
    };

    if (productId) payload.product_id = productId;
    if (avatarLabel) payload.avatar_label = avatarLabel;

    const { data, error } = await supabase
      .from("ugc_projects")
      .insert(payload)
      .select(LIST_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project: data }, { status: 201 });
  } catch (err) {
    console.error("[api/ugc/projects][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
