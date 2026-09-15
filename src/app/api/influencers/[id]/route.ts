import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SELECT_FIELDS =
  "id, user_id, name, handle, gender, age_range, styles, hair_color, eye_color, additional_details, variations, avatar_image_url, created_at";

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
      handle?: string | null;
      avatar_image_url?: string | null;
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

    if (Object.prototype.hasOwnProperty.call(body, "handle")) {
      patch.handle =
        typeof body.handle === "string" ? body.handle.trim() || null : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "avatar_image_url")) {
      const avatar =
        typeof body.avatar_image_url === "string"
          ? body.avatar_image_url.trim() || null
          : null;
      patch.avatar_image_url = avatar;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido enviado para atualização." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("influencers")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(SELECT_FIELDS)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Influencer não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      influencer: {
        ...data,
        reference_image_urls: [],
        status: data.avatar_image_url ? "active" : "draft",
        updated_at: data.created_at,
      },
    });
  } catch (err) {
    console.error("[api/influencers/:id][PATCH] Error:", err);
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
      .from("influencers")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Influencer não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[api/influencers/:id][DELETE] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
