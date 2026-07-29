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

    // action:"use" → incrementa use_count + seta last_used_at (atalho para o botão Usar)
    const isUseAction = body?.action === "use";

    const patch: Record<string, unknown> = {};

    if (isUseAction) {
      patch.use_count = (existing.use_count ?? 0) + 1;
      patch.last_used_at = new Date().toISOString();
    } else {
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
      if (Object.prototype.hasOwnProperty.call(body, "negative_prompt")) {
        patch.negative_prompt =
          typeof body.negative_prompt === "string"
            ? body.negative_prompt.trim() || null
            : null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "type")) {
        if (body.type == null || body.type === "") {
          patch.type = null;
        } else {
          const type = normalizeType(body.type);
          if (!type) {
            return NextResponse.json(
              { error: "Tipo inválido. Use image, video, audio ou any." },
              { status: 400 }
            );
          }
          patch.type = type;
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, "tags")) {
        patch.tags = normalizeTags(body.tags);
      }
      if (Object.prototype.hasOwnProperty.call(body, "default_model_id")) {
        patch.default_model_id =
          typeof body.default_model_id === "string"
            ? body.default_model_id.trim() || null
            : null;
      }
      // suporte ao campo legado
      if (body?.increment_use === true) {
        patch.use_count = (existing.use_count ?? 0) + 1;
        patch.last_used_at = new Date().toISOString();
      }
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
      .select(SELECT_FIELDS)
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
