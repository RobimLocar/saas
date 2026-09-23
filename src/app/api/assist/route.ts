import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `Você é um especialista em prompts para modelos de IA generativa (imagem, vídeo e áudio).
Reescreva o prompt do usuário para obter o melhor resultado possível no modelo indicado:
- Mantenha a intenção original e prefira escrever o prompt final em inglês (modelos entendem melhor inglês).
- Adicione detalhes de composição, iluminação, estilo, câmera/movimento (vídeo) ou gênero/instrumentação (áudio) quando fizer sentido.
- Seja conciso: no máximo 3 frases, sem listas, sem aspas, sem comentários — responda APENAS com o prompt melhorado.`;

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
    const modality = typeof body?.modality === "string" ? body.modality : "image";

    if (!prompt) {
      return NextResponse.json({ error: "Prompt é obrigatório" }, { status: 400 });
    }

    const apiKey = process.env.ABACUS_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;

    if (!apiKey || !baseUrl) {
      return NextResponse.json(
        { error: "Serviço de assistência não configurado" },
        { status: 503 }
      );
    }

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
            content: `Tipo de geração: ${modality}\nPrompt original: ${prompt}`,
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Falha ao melhorar o prompt. Tente novamente." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const improved: string = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!improved) {
      return NextResponse.json(
        { error: "Resposta vazia do assistente." },
        { status: 502 }
      );
    }

    return NextResponse.json({ prompt: improved });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao melhorar o prompt" },
      { status: 500 }
    );
  }
}
