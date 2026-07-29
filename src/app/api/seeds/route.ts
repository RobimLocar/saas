import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tag = req.nextUrl.searchParams.get("tag")?.trim();

    let query = supabase
      .from("seeds")
      .select(
        "id, user_id, name, description, asset_id, preview_url, tags, use_count, last_used_at, created_at"
      )
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (tag) {
      query = query.contains("tags", [tag]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ seeds: data || [] });
  } catch (err) {
    console.error("[api/seeds][GET] Error:", err);
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
    const description =
      typeof body?.description === "string" ? body.description.trim() || null : null;
    const assetId = typeof body?.asset_id === "string" ? body.asset_id.trim() || null : null;
    let previewUrl =
      typeof body?.preview_url === "string" ? body.preview_url.trim() || null : null;
    const tags = normalizeTags(body?.tags);

    if (!name) {
      return NextResponse.json({ error: "O campo name é obrigatório." }, { status: 400 });
    }

    if (assetId && !previewUrl) {
      const { data: asset, error: assetError } = await supabase
        .from("assets")
        .select("image_url")
        .eq("id", assetId)
        .maybeSingle();

      if (assetError) {
        return NextResponse.json({ error: assetError.message }, { status: 500 });
      }

      previewUrl = asset?.image_url ?? null;
    }

    const payload: {
      user_id: string;
      name: string;
      description?: string | null;
      asset_id?: string | null;
      preview_url?: string | null;
      tags?: string[];
    } = {
      user_id: user.id,
      name,
    };

    if (description !== null) payload.description = description;
    if (assetId) payload.asset_id = assetId;
    if (previewUrl) payload.preview_url = previewUrl;
    if (tags !== undefined) payload.tags = tags;

    const { data, error } = await supabase
      .from("seeds")
      .insert(payload)
      .select(
        "id, user_id, name, description, asset_id, preview_url, tags, use_count, last_used_at, created_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ seed: data }, { status: 201 });
  } catch (err) {
    console.error("[api/seeds][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
