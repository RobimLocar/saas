import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SYSTEM_PROMPT =
  "You are a social media expert. Generate 3 engaging captions for Instagram/TikTok. Each caption should include relevant emojis and 3-5 hashtags. Keep them authentic, engaging and on-brand. Return as JSON array of 3 strings.";

function tryParseCaptionArray(raw: string): string[] | null {
  const direct = (() => {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed.map((x) => x.trim()).filter(Boolean).slice(0, 3);
      }
    } catch {
      // noop
    }
    return null;
  })();
  if (direct && direct.length > 0) return direct;

  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed.map((x) => x.trim()).filter(Boolean).slice(0, 3);
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const contentId = typeof body?.content_id === "string" ? body.content_id.trim() : "";
    const freePrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    const { data: influencer, error: infErr } = await supabase
      .from("influencers")
      .select("id, name, gender, age_range, styles, hair_color, eye_color")
      .eq("id", influencerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer não encontrado" }, { status: 404 });
    }

    let contextPrompt = freePrompt;

    if (contentId) {
      const { data: content, error: contentErr } = await supabase
        .from("influencer_content")
        .select("id, category, prompt, image_url")
        .eq("id", contentId)
        .eq("influencer_id", influencerId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (contentErr) {
        return NextResponse.json({ error: contentErr.message }, { status: 500 });
      }
      if (!content) {
        return NextResponse.json({ error: "Item de conteúdo não encontrado" }, { status: 404 });
      }

      contextPrompt = [
        `influencer: ${influencer.name}`,
        `category: ${content.category || "general"}`,
        `visual prompt: ${content.prompt || ""}`,
        content.image_url ? `image url: ${content.image_url}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (!contextPrompt) {
      return NextResponse.json(
        { error: "Forneça content_id ou prompt para gerar legendas" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ABACUS_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;

    if (!apiKey || !baseUrl) {
      return NextResponse.json({ error: "LLM não configurado" }, { status: 503 });
    }

    const llmRes = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ASSIST_LLM_MODEL || "gpt-5.4-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Influencer context:\n${JSON.stringify(influencer)}\n\nContent context:\n${contextPrompt}`,
          },
        ],
        max_tokens: 400,
      }),
    });

    if (!llmRes.ok) {
      return NextResponse.json({ error: "Falha ao gerar legendas" }, { status: 502 });
    }

    const llmData = await llmRes.json().catch(() => null);
    const raw =
      typeof llmData?.choices?.[0]?.message?.content === "string"
        ? llmData.choices[0].message.content
        : "";

    const captions = tryParseCaptionArray(raw);

    if (!captions || captions.length === 0) {
      return NextResponse.json(
        { error: "Resposta inválida do LLM para legendas" },
        { status: 502 }
      );
    }

    while (captions.length < 3) {
      captions.push(captions[captions.length - 1]);
    }

    return NextResponse.json({ captions: captions.slice(0, 3) });
  } catch (err) {
    console.error("[api/influencers/:id/captions][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;
    const supabase = await createClient();
    const service = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const contentId = typeof body?.content_id === "string" ? body.content_id.trim() : "";
    const caption = typeof body?.caption === "string" ? body.caption.trim() : "";

    if (!contentId || !caption) {
      return NextResponse.json(
        { error: "content_id e caption são obrigatórios" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await service
      .from("influencer_content")
      .update({ caption })
      .eq("id", contentId)
      .eq("influencer_id", influencerId)
      .eq("user_id", user.id)
      .select("id, influencer_id, user_id, category, prompt, image_url, generation_id, caption, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: "Item de conteúdo não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (err) {
    console.error("[api/influencers/:id/captions][PATCH] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
