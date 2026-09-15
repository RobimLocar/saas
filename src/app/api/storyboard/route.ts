import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Storyboard: LLM multimodal da PiAPI analisa a imagem conectada e gera N prompts de cena.
const PIAPI_OPENAI_BASE = "https://api.piapi.ai/v1";

const SYSTEM_PROMPT = `You are a senior creative director building a storyboard from a reference image.
Look at the image and write distinct, production-ready generation prompts (each a full scene) that build a coherent visual sequence inspired by it.
Rules:
- Keep the subject, style, lighting and color palette consistent with the image across all prompts.
- Each prompt: one line, in English, concrete and visual (composition, camera, lighting, mood). No numbering words, no quotes, no commentary.
- Return ONLY the prompts, exactly one per line.`;

function isHttp(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const imageUrl = body?.image_url;
    const count = Math.min(Math.max(Number(body?.count) || 4, 1), 8);
    const aspect = typeof body?.aspect_ratio === "string" ? body.aspect_ratio : "1:1";

    if (!isHttp(imageUrl)) {
      return NextResponse.json({ error: "Conecte ou envie uma imagem válida." }, { status: 400 });
    }

    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "PIAPI_API_KEY não configurada" }, { status: 503 });
    }

    const res = await fetch(`${PIAPI_OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.STORYBOARD_LLM_MODEL || "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Generate exactly ${count} storyboard prompts (aspect ${aspect}). One prompt per line.` },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[storyboard] PiAPI LLM erro", res.status, t.slice(0, 300));
      return NextResponse.json({ error: "Falha ao analisar a imagem. Tente novamente." }, { status: 502 });
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content?.trim() || "";
    const prompts = raw
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:\d+[.)\-:]|[-*•])\s*/, "").trim())
      .filter((l) => l.length > 3)
      .slice(0, count);

    if (!prompts.length) {
      return NextResponse.json({ error: "O modelo não retornou prompts." }, { status: 502 });
    }
    return NextResponse.json({ prompts });
  } catch {
    return NextResponse.json({ error: "Erro interno no storyboard" }, { status: 500 });
  }
}
