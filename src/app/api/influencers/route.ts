import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SELECT_FIELDS =
  "id, user_id, name, handle, gender, age_range, styles, hair_color, eye_color, additional_details, variations, avatar_image_url, created_at";

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
      .from("influencers")
      .select(SELECT_FIELDS)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const normalized = (data ?? []).map((row) => ({
      ...row,
      reference_image_urls: [],
      status: row.avatar_image_url ? "active" : "draft",
      updated_at: row.created_at,
    }));

    return NextResponse.json({ influencers: normalized });
  } catch (err) {
    console.error("[api/influencers][GET] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
