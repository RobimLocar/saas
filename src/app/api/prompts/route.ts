import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PromptType = "image" | "video" | "audio" | "any";

const VALID_TYPES: PromptType[] = ["image", "video", "audio", "any"];

function normalizeType(value: unknown): PromptType | null {
  if (typeof value !== "string") return null;
  const v = value as PromptType;
  return VALID_TYPES.includes(v) ? v : null;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
}

const SELECT_FIELDS =
  "id, title, prompt, negative_prompt, type, tags, default_model_id, use_count, last_used_at, created_at";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const typeParam = req.nextUrl.searchParams.get("type");

    if (typeParam && typeParam !== "any") {
      const type = normalizeType(typeParam);
      if (!type) {
        return NextResponse.json(
          { error: "Tipo inválido. Use image, video, audio ou any." },
          { status: 400 }
        );
      }
    }

    let query = supabase
      .from("saved_prompts")
      .select(SELECT_FIELDS)
      .order("created_at", { ascending: false });

    if (typeParam && typeParam !== "any") {
      query = query.eq("type", typeParam);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prompts: data ?? [] });
  } catch (err) {
    console.error("[api/prompts][GET] Error:", err);
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
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "O campo prompt é obrigatório." },
        { status: 400 }
      );
    }

    const title =
      typeof body?.title === "string" ? body.title.trim() || null : null;
    const negative_prompt =
      typeof body?.negative_prompt === "string"
        ? body.negative_prompt.trim() || null
        : null;
    const type = normalizeType(body?.type);
    const tags = normalizeTags(body?.tags);
    const default_model_id =
      typeof body?.default_model_id === "string"
        ? body.default_model_id.trim() || null
        : null;

    const payload: Record<string, unknown> = {
      user_id: user.id, // obrigatório para satisfazer RLS WITH CHECK
      prompt,
    };
    if (title !== null) payload.title = title;
    if (negative_prompt !== null) payload.negative_prompt = negative_prompt;
    if (type) payload.type = type;
    if (tags.length > 0) payload.tags = tags;
    if (default_model_id) payload.default_model_id = default_model_id;

    const { data, error } = await supabase
      .from("saved_prompts")
      .insert(payload)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prompt: data }, { status: 201 });
  } catch (err) {
    console.error("[api/prompts][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
