import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FULL_FIELDS =
  "id, user_id, name, product_id, avatar_seed_id, avatar_label, avatar_image_url, script, segments, broll, status, created_at, updated_at";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ugc_projects")
      .select(FULL_FIELDS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error("[api/ugc/projects/:id][GET] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const patch: {
      name?: string;
      product_id?: string | null;
      avatar_seed_id?: string | null;
      avatar_label?: string | null;
      avatar_image_url?: string | null;
      script?: unknown;
      segments?: unknown;
      status?: string | null;
      updated_at?: string;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json(
          { error: "O campo name não pode ficar vazio." },
          { status: 400 }
        );
      }
      patch.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "product_id")) {
      patch.product_id =
        typeof body.product_id === "string" ? body.product_id.trim() || null : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "avatar_seed_id")) {
      patch.avatar_seed_id =
        typeof body.avatar_seed_id === "string"
          ? body.avatar_seed_id.trim() || null
          : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "avatar_label")) {
      patch.avatar_label =
        typeof body.avatar_label === "string" ? body.avatar_label.trim() || null : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "avatar_image_url")) {
      patch.avatar_image_url =
        typeof body.avatar_image_url === "string"
          ? body.avatar_image_url.trim() || null
          : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "script")) {
      patch.script = body.script;
    }

    if (Object.prototype.hasOwnProperty.call(body, "segments")) {
      patch.segments = body.segments;
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      patch.status = typeof body.status === "string" ? body.status.trim() || null : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido enviado para atualização." },
        { status: 400 }
      );
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("ugc_projects")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(FULL_FIELDS)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ project: data });
  } catch (err) {
    console.error("[api/ugc/projects/:id][PATCH] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ugc_projects")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/ugc/projects/:id][DELETE] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
