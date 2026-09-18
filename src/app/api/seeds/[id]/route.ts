import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
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

    const { data: existing, error: existingError } = await supabase
      .from("seeds")
      .select("id, use_count")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Seed não encontrada" }, { status: 404 });
    }

    const body = await req.json();

    const patch: {
      name?: string;
      description?: string | null;
      tags?: string[];
      use_count?: number;
      last_used_at?: string;
    } = {};

    if (body?.action === "use") {
      patch.use_count = (existing.use_count || 0) + 1;
      patch.last_used_at = new Date().toISOString();
    } else {
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

      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        patch.description =
          typeof body.description === "string"
            ? body.description.trim() || null
            : null;
      }

      if (Object.prototype.hasOwnProperty.call(body, "tags")) {
        patch.tags = normalizeTags(body.tags) ?? [];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido enviado para atualização." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("seeds")
      .update(patch)
      .eq("id", id)
      .select(
        "id, user_id, name, description, asset_id, preview_url, tags, use_count, last_used_at, created_at"
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Seed não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ seed: data });
  } catch (err) {
    console.error("[api/seeds/:id][PATCH] Error:", err);
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
      .from("seeds")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Seed não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[api/seeds/:id][DELETE] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
