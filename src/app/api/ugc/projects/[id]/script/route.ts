import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `Você é um roteirista especialista em vídeos UGC (User Generated Content) para short-form (TikTok/Reels/Shorts).
Crie um roteiro CURTO e IMPACTANTE para um vídeo de 30-60 segundos no formato JSON.
Responda APENAS com JSON válido, sem markdown, sem texto extra:
{"hook":{"text":"..."},"body1":{"text":"..."},"body2":{"text":"..."},"cta":{"text":"..."}}
Regras:
- hook: gancho de 5-8 segundos que prende atenção imediatamente (máx 15 palavras)
- body1: primeiro benefício/ponto principal (máx 20 palavras)  
- body2: segundo benefício ou prova social (máx 20 palavras)
- cta: chamada para ação clara e urgente (máx 12 palavras)
Tom: autêntico, conversacional, sem parecer propaganda. Como um amigo recomendando.`;

type ScriptBlock = { text: string };
type ScriptShape = {
  hook: ScriptBlock;
  body1: ScriptBlock;
  body2: ScriptBlock;
  cta: ScriptBlock;
};

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toScriptShape(input: unknown): ScriptShape {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const hook = sanitizeText((obj.hook as Record<string, unknown> | undefined)?.text);
  const body1 = sanitizeText((obj.body1 as Record<string, unknown> | undefined)?.text);
  const body2 = sanitizeText((obj.body2 as Record<string, unknown> | undefined)?.text);
  const cta = sanitizeText((obj.cta as Record<string, unknown> | undefined)?.text);

  return {
    hook: { text: hook || "Gancho direto com benefício principal para chamar atenção." },
    body1: { text: body1 || "Explique o principal benefício em linguagem simples e concreta." },
    body2: { text: body2 || "Adicione prova social, resultado ou diferencial real do produto." },
    cta: { text: cta || "Peça para agir agora com clareza e urgência." },
  };
}

function fallbackFromText(raw: string): ScriptShape {
  const normalized = raw
    .replace(/```json|```/gi, "")
    .replace(/\r/g, "")
    .trim();

  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);

  const hookLine = lines.find((line) => /^hook[:\-]/i.test(line));
  const body1Line = lines.find((line) => /^body\s*1[:\-]/i.test(line));
  const body2Line = lines.find((line) => /^body\s*2[:\-]/i.test(line));
  const ctaLine = lines.find((line) => /^cta[:\-]/i.test(line));

  const stripLabel = (line: string | undefined) =>
    (line || "")
      .replace(/^hook[:\-]\s*/i, "")
      .replace(/^body\s*1[:\-]\s*/i, "")
      .replace(/^body\s*2[:\-]\s*/i, "")
      .replace(/^cta[:\-]\s*/i, "")
      .trim();

  const pure = lines.filter(
    (line) => !/^hook[:\-]|^body\s*1[:\-]|^body\s*2[:\-]|^cta[:\-]/i.test(line)
  );

  const hook = stripLabel(hookLine) || pure[0] || "Gancho direto com benefício principal para chamar atenção.";
  const body1 = stripLabel(body1Line) || pure[1] || "Explique o principal benefício em linguagem simples e concreta.";
  const body2 = stripLabel(body2Line) || pure[2] || "Adicione prova social, resultado ou diferencial real do produto.";
  const cta = stripLabel(ctaLine) || pure[3] || "Peça para agir agora com clareza e urgência.";

  return {
    hook: { text: hook },
    body1: { text: body1 },
    body2: { text: body2 },
    cta: { text: cta },
  };
}

function parseScriptFromLLM(content: string): ScriptShape {
  const cleaned = content.trim();

  try {
    return toScriptShape(JSON.parse(cleaned));
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = cleaned.slice(first, last + 1);
      try {
        return toScriptShape(JSON.parse(candidate));
      } catch {
        return fallbackFromText(cleaned);
      }
    }
    return fallbackFromText(cleaned);
  }
}

function fallbackFromDescription(description: string, productName?: string): ScriptShape {
  const base = description.replace(/\s+/g, " ").trim();
  const short = base.slice(0, 120);
  const title = productName?.trim() || "seu produto";
  return {
    hook: { text: `Você já testou ${title} que resolve isso rápido?` },
    body1: { text: `Ele ajuda com ${short || "o problema principal"} sem complicação.` },
    body2: { text: "Textura leve, resultado visível e uso prático no dia a dia." },
    cta: { text: "Teste hoje e veja a diferença na primeira semana." },
  };
}

export async function POST(
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

    const body = await req.json();
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    const productId =
      typeof body?.product_id === "string" ? body.product_id.trim() || null : null;

    if (!description) {
      return NextResponse.json({ error: "O campo description é obrigatório." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from("ugc_projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    let productName = "";
    if (productId) {
      const { data: product } = await supabase
        .from("products")
        .select("title")
        .eq("id", productId)
        .eq("user_id", user.id)
        .maybeSingle();
      productName = typeof product?.title === "string" ? product.title.trim() : "";
    }

    const apiKey = process.env.ABACUS_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;

    if (!apiKey || !baseUrl) {
      return NextResponse.json(
        { error: "Serviço de IA não configurado." },
        { status: 503 }
      );
    }

    const userPrompt = productName
      ? `Produto: ${productName}\nDescrição: ${description}`
      : `Descrição: ${description}`;

    let script: ScriptShape;

    try {
      const llmRes = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.4-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 300,
        }),
      });

      if (!llmRes.ok) {
        script = fallbackFromDescription(description, productName);
      } else {
        const llmData = await llmRes.json();
        const content: string = llmData?.choices?.[0]?.message?.content?.trim() || "";
        script = content
          ? parseScriptFromLLM(content)
          : fallbackFromDescription(description, productName);
      }
    } catch {
      script = fallbackFromDescription(description, productName);
    }

    const { error: updateError } = await supabase
      .from("ugc_projects")
      .update({ script, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ script });
  } catch (err) {
    console.error("[api/ugc/projects/:id/script][POST] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
