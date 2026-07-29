import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/generations/:id
 * Remove a geração do usuário (soft delete visual no feed).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: generation, error: selectError } = await supabase
      .from("generations")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (!generation) {
      return NextResponse.json({ error: "Geração não encontrada" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("generations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[api/generations/:id] DELETE error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/generations/:id
 * Atualiza flags da geração (armazenadas no JSONB params):
 *   { is_favorite?: boolean, prompt_favorite?: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, boolean> = {};
    if (typeof body.is_favorite === "boolean") patch.is_favorite = body.is_favorite;
    if (typeof body.prompt_favorite === "boolean") patch.prompt_favorite = body.prompt_favorite;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: generation, error: selectError } = await supabase
      .from("generations")
      .select("id, params")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (!generation) {
      return NextResponse.json({ error: "Geração não encontrada" }, { status: 404 });
    }

    const mergedParams = {
      ...((generation.params as Record<string, unknown> | null) || {}),
      ...patch,
    };

    const { error: updateError } = await supabase
      .from("generations")
      .update({ params: mergedParams })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id, params: mergedParams });
  } catch (err) {
    console.error("[api/generations/:id] PATCH error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
