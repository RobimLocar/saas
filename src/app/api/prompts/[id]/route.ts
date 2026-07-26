import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PromptType = "image" | "video" | "audio";

function normalizeType(value: unknown): PromptType | null {
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
      .from("saved_prompts")
      .select("id, use_count")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Prompt não encontrado" }, { status: 404 });
    }

    const body = await req.json();

    const patch: {
      title?: string | null;
      prompt?: string;
      type?: PromptType;
      tags?: string[];
      use_count?: number;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      patch.title = title || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "prompt")) {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        return NextResponse.json(
          { error: "O campo prompt não pode ficar vazio." },
          { status: 400 }
        );
      }
      patch.prompt = prompt;
    }

    if (Object.prototype.hasOwnProperty.call(body, "type")) {
      if (body.type == null || body.type === "") {
        patch.type = undefined;
      } else {
        const type = normalizeType(body.type);
        if (!type) {
          return NextResponse.json(
            { error: "Tipo inválido. Use image, video ou audio." },
            { status: 400 }
          );
        }
        patch.type = type;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "tags")) {
      const tags = normalizeTags(body.tags);
      patch.tags = tags ?? [];
    }

    if (body?.increment_use === true) {
      patch.use_count = (existing.use_count || 0) + 1;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo válido enviado para atualização." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("saved_prompts")
      .update(patch)
      .eq("id", id)
      .select("id, title, prompt, type, tags, use_count, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Prompt não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ prompt: data });
  } catch (err) {
    console.error("[api/prompts/:id][PATCH] Error:", err);
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
      .from("saved_prompts")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Prompt não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("[api/prompts/:id][DELETE] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
