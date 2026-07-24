import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Backends PiAPI realmente integrados e funcionando hoje.
// Cada modelo do catálogo aponta para um deles via params.backend
// (fallback: o próprio model_id).
const WORKING_BACKENDS = [
  "Qubico/flux1-schnell",
  "Qubico/flux1-dev",
  "gpt-image-2",
  "kling",
  "hailuo",
  "luma",
  "Qubico/hunyuan",
  "Qubico/ace-step",
  "music-u",
  "Qubico/diffrhythm",
  "atlas-tts",
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const type = req.nextUrl.searchParams.get("type"); // image | video | audio | null

    let query = supabase
      .from("ai_models")
      .select(
        "id, name, provider, type, model_id, credit_cost, params, min_plan, thumbnail_url, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (type) query = query.eq("type", type);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const models = (data || []).map((m) => {
      const p = (m.params as Record<string, unknown> | null) || {};
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        type: m.type,
        model_id: m.model_id,
        credit_cost: m.credit_cost,
        min_plan: m.min_plan,
        family: (p.family as string) || m.provider || "Outros",
        family_description: (p.family_description as string) || "",
        badge: (p.badge as string) || null,
        gen_time: (p.gen_time as string) || null,
        kind: (p.kind as string) || null,
        has_audio: Boolean(p.has_audio),
        resolution: (p.resolution as string) || null,
        duration_range: (p.duration_range as string) || null,
        dur_min: typeof p.dur_min === "number" ? p.dur_min : null,
        dur_max: typeof p.dur_max === "number" ? p.dur_max : null,
        thumbnail_url: m.thumbnail_url,
        // Disponível se é modelo premium (provider gpt-image/abacus) ou
        // se o backend efetivo (params.backend ?? model_id) está integrado
        available:
          (p.provider as string) === "gpt-image" ||
          (p.provider as string) === "abacus" ||
          WORKING_BACKENDS.includes((p.backend as string) || m.model_id),
      };
    });

    return NextResponse.json({ models });
  } catch (err) {
    console.error("[api/models] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
