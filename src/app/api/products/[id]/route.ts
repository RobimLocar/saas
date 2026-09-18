import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SELECT_FIELDS = "id, title, description, image_url, created_at";

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
      title?: string;
      description?: string | null;
      image_url?: string;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return NextResponse.json(
          { error: "O campo title não pode ficar vazio." },
          { status: 400 }
        );
      }
      patch.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      patch.description =
        typeof body.description === "string" ? body.description.trim() || null : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "image_url")) {
      const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : "";
      if (!imageUrl) {
        return NextResponse.json(
          { error: "O campo image_url não pode ficar vazio." },
          { status: 400 }
        );
      }
      patch.image_url = imageUrl;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido enviado para atualização." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(SELECT_FIELDS)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ product: data });
  } catch (err) {
    console.error("[api/products/:id][PATCH] Error:", err);
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
      .from("products")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[api/products/:id][DELETE] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
