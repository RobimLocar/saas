// Tradução de prompt para inglês (server-side), reusando o RouteLLM (Abacus,
// OpenAI-compatible) já configurado. As IAs de geração performam melhor em
// inglês, então todo prompt do usuário passa por aqui antes de ir à PiAPI.
//
// É BEST-EFFORT: se a tradução falhar ou não estiver configurada, devolve o
// texto original — nunca bloqueia a geração.

const BASE_URL = process.env.LLM_BASE_URL || "https://routellm.abacus.ai/v1";
const API_KEY = process.env.ABACUS_API_KEY || "";
const MODEL = process.env.ASSIST_LLM_MODEL || "gpt-5.4-mini";

// Palavras-função fortes de PT/ES/FR — indício de que NÃO é inglês.
const NON_EN_HINTS =
  /\b(que|não|nao|você|voce|com|para|uma|dos|das|pelo|então|também|está|são|fazer|el|la|los|las|una|con|para|pero|porque|est|avec|pour|une|des|dans|vous|c'est|qu'il)\b/i;
// Diacríticos comuns de PT/ES/FR.
const DIACRITICS = /[áàâãäéèêëíìîïóòôõöúùûüçñ]/i;

/** Heurística rápida: parece já estar em inglês? (evita chamada desnecessária) */
export function looksEnglish(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (DIACRITICS.test(t)) return false;
  if (NON_EN_HINTS.test(t)) return false;
  return true;
}

/**
 * Traduz `text` para inglês. Devolve o próprio texto se já parecer inglês,
 * se não houver provedor, ou se a chamada falhar.
 */
export async function translateToEnglish(text: string): Promise<string> {
  const original = (text || "").trim();
  if (!original) return text;
  if (!API_KEY) return text;
  if (looksEnglish(original)) return original;

  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a translation engine for AI image/video/audio generation prompts. Translate the user's prompt to natural English. Preserve meaning, style, technical and cinematographic terms. Keep proper nouns, brand names and any text meant to appear on screen (inside quotes) unchanged. Output ONLY the translated prompt, with no preamble, quotes or explanations. If the text is already English, return it unchanged.",
          },
          { role: "user", content: original },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return original;
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    const translated = typeof out === "string" ? out.trim() : "";
    return translated || original;
  } catch {
    return original;
  }
}
