import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/assets — lista os assets do usuário
 * Query params: ?category=image|video|audio|custom &limit=50 &offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const url = req.nextUrl;
    const category = url.searchParams.get("category") || url.searchParams.get("modality");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = supabase
      .from("assets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq("category", category);
    }

    const { data: assets, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assets: assets || [], count: assets?.length || 0 });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/assets — deleta um asset
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { asset_id } = await req.json();

    if (!asset_id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    // Verificar que pertence ao usuário
    const { data: asset } = await supabase
      .from("assets")
      .select("image_url")
      .eq("id", asset_id)
      .eq("user_id", user.id)
      .single();

    if (!asset) {
      return NextResponse.json({ error: "Asset não encontrado" }, { status: 404 });
    }

    // Se a mídia está no nosso Storage, remover o arquivo também
    if (asset.image_url) {
      for (const bucket of ["assets", "uploads"]) {
        const marker = `/storage/v1/object/public/${bucket}/`;
        const idx = asset.image_url.indexOf(marker);
        if (idx !== -1) {
          const path = decodeURIComponent(asset.image_url.slice(idx + marker.length));
          await supabase.storage.from(bucket).remove([path]);
          break;
        }
      }
    }

    // Deletar do banco
    await supabase.from("assets").delete().eq("id", asset_id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
