// P11a — Cliente LLM Atlas (OpenAI-compatible). Transporte reutilizável para que
// callers como storyboard/script POSSAM, no futuro, selecionar modelos Atlas sem
// reimplementar fetch inline. NÃO migra nenhum caller de produção automaticamente.
// NÃO constrói UI de LLM. Respeita `supported_apis` conceitualmente: nem todo modelo
// suporta toda opção — o caller declara o modelo; aqui só há o transporte de chat.

const ATLAS_LLM_BASE = "https://api.atlascloud.ai/v1";
const API_KEY = process.env.ATLAS_API_KEY || "";

export interface AtlasChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AtlasChatResult {
  ok: boolean;
  content: string;
  error: string | null;
}

/**
 * Chat completion OpenAI-compatible via Atlas. `baseUrl` default = Atlas; pode ser
 * sobrescrito em teste. NUNCA loga a API key.
 */
export async function atlasChatCompletion(opts: {
  model: string;
  messages: AtlasChatMessage[];
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}): Promise<AtlasChatResult> {
  const key = opts.apiKey ?? API_KEY;
  if (!key) return { ok: false, content: "", error: "ATLAS_API_KEY não configurada" };
  const base = (opts.baseUrl ?? ATLAS_LLM_BASE).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: typeof opts.maxTokens === "number" ? opts.maxTokens : 600,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, content: "", error: `Erro ${res.status} do LLM Atlas` };
    }
    const content: string =
      (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
        ?.content?.trim() || "";
    return { ok: true, content, error: null };
  } catch (e) {
    return { ok: false, content: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export const ATLAS_LLM_BASE_URL = ATLAS_LLM_BASE;
