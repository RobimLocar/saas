import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SELECT_FIELDS = "id, title, description, image_url, created_at";

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
      .from("products")
      .select(SELECT_FIELDS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    console.error("[api/products][GET] Error:", err);
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
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim() : "";
    const description =
      typeof body?.description === "string" ? body.description.trim() || null : null;

    if (!title || !imageUrl) {
      return NextResponse.json(
        { error: "Os campos title e image_url são obrigatórios." },
        { status: 400 }
      );
    }

    const payload: {
      user_id: string;
      title: string;
      image_url: string;
      description?: string | null;
    } = {
      user_id: user.id,
      title,
      image_url: imageUrl,
    };

    if (description !== null) {
      payload.description = description;
    }

    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (err) {
    console.error("[api/products][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
