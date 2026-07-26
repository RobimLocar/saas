import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PromptType = "image" | "video" | "audio";

function normalizeType(value: string | null): PromptType | null {
  if (!value) return null;
  if (value === "image" || value === "video" || value === "audio") return value;
  return null;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
  return tags.length > 0 ? tags : [];
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

    const typeParam = req.nextUrl.searchParams.get("type");
    const type = typeParam === "any" ? null : normalizeType(typeParam);
    if (typeParam && typeParam !== "any" && !type) {
      return NextResponse.json(
        { error: "Tipo inválido. Use image, video, audio ou any." },
        { status: 400 }
      );
    }

    let query = supabase
      .from("saved_prompts")
      .select("id, title, prompt, type, tags, use_count, created_at")
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prompts: data || [] });
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
    const title = typeof body?.title === "string" ? body.title.trim() : null;
    const type = normalizeType(typeof body?.type === "string" ? body.type : null);
    const tags = normalizeTags(body?.tags);

    if (!prompt) {
      return NextResponse.json(
        { error: "O campo prompt é obrigatório." },
        { status: 400 }
      );
    }

    const payload: {
      prompt: string;
      title?: string | null;
      type?: PromptType;
      tags?: string[];
    } = {
      prompt,
    };

    if (title) payload.title = title;
    if (type) payload.type = type;
    if (tags !== undefined) payload.tags = tags;

    const { data, error } = await supabase
      .from("saved_prompts")
      .insert(payload)
      .select("id, title, prompt, type, tags, use_count, created_at")
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
