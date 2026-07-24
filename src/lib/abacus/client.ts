// Cliente para o endpoint RouteLLM da Abacus (OpenAI-compatible) — geração de
// imagem de ALTO NÍVEL via /chat/completions com modelos dedicados de imagem
// (gpt_image2, nano_banana, nano_banana_pro, ideogram etc).
//
// A resposta OpenAI-compatible traz a imagem no content da mensagem — como
// markdown ![...](url), URL direta, data-URL base64 ou no campo images[].
// extractImageUrl cobre todos esses formatos.

const BASE_URL = process.env.LLM_BASE_URL || "https://routellm.abacus.ai/v1";
const API_KEY = process.env.ABACUS_API_KEY || "";

export class AbacusImageError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AbacusImageError";
    this.status = status;
  }
}

export interface AbacusImageParams {
  model: string; // ex: "gpt_image2", "nano_banana_pro", "ideogram"
  prompt: string;
  aspect_ratio?: string; // "1:1" | "16:9" | ...
  quality?: "low" | "medium" | "high";
  reference_image_url?: string;
}

interface ChatMessageContent {
  type?: string;
  text?: string;
  image_url?: { url?: string } | string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | ChatMessageContent[];
      images?: Array<{ image_url?: { url?: string } | string; url?: string }>;
    };
  }>;
  error?: { message?: string } | string;
}

function extractImageUrl(data: ChatCompletionResponse): string | null {
  const msg = data.choices?.[0]?.message;
  if (!msg) return null;

  // 1) Campo images[] (formato multimodal)
  for (const img of msg.images || []) {
    const u =
      typeof img.image_url === "string"
        ? img.image_url
        : img.image_url?.url || img.url;
    if (u) return u;
  }

  // 2) Content como array de partes
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      const u =
        typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      if (u) return u;
      if (part.text) {
        const found = findUrlInText(part.text);
        if (found) return found;
      }
    }
    return null;
  }

  // 3) Content como string (markdown / URL / data-URL)
  if (typeof msg.content === "string") return findUrlInText(msg.content);
  return null;
}

function findUrlInText(text: string): string | null {
  // markdown ![alt](url)
  const md = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/);
  if (md) return md[1];
  // data-URL base64
  const dataUrl = text.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrl) return dataUrl[0];
  // URL crua de imagem
  const raw = text.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
  if (raw) return raw[0];
  // qualquer URL http (último recurso)
  const any = text.match(/https?:\/\/\S+/);
  return any ? any[0].replace(/[).,]+$/, "") : null;
}

// Geração SÍNCRONA (o RouteLLM responde com a imagem pronta).
// Retorna a URL (http ou data-URL) da imagem gerada.
export async function generateImageAbacus(
  params: AbacusImageParams
): Promise<string> {
  if (!API_KEY) {
    throw new AbacusImageError("Provider Abacus não configurado", 500);
  }

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: params.prompt },
  ];
  if (params.reference_image_url) {
    content.push({
      type: "image_url",
      image_url: { url: params.reference_image_url },
    });
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [{ role: "user", content }],
      modalities: ["image"],
      image_config: {
        n: 1,
        ...(params.aspect_ratio ? { aspect_ratio: params.aspect_ratio } : {}),
        ...(params.quality ? { quality: params.quality } : {}),
      },
    }),
  });

  const text = await res.text();
  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new AbacusImageError(
      `Resposta inválida do provedor (${res.status})`,
      res.status
    );
  }

  if (!res.ok) {
    const errMsg =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || `Erro ${res.status} do provedor`;
    throw new AbacusImageError(errMsg, res.status);
  }

  const url = extractImageUrl(data);
  if (!url) {
    throw new AbacusImageError("Provedor não retornou imagem", 502);
  }
  return url;
}

// ─── TTS (text-to-speech) ────────────────────────────────────────────────────
// A PiAPI não integra ElevenLabs; o RouteLLM da Abacus expõe TTS via os modelos
// gpt-4o-audio-preview / gpt-4o-mini-audio-preview em /chat/completions
// (modalities:["text","audio"], audio:{voice, format}). A resposta traz o MP3
// em base64 no campo message.audios[].data.

export interface AbacusSpeechParams {
  text: string;
  voice?: string; // voz OpenAI: alloy | echo | fable | onyx | nova | shimmer
  model?: string; // gpt-4o-audio-preview | gpt-4o-mini-audio-preview
}

interface AudioChatResponse {
  choices?: Array<{
    message?: {
      audios?: Array<{ data?: string; transcript?: string }>;
      audio?: { data?: string };
    };
  }>;
  error?: { message?: string } | string;
}

/**
 * Sintetiza fala e retorna o MP3 como Buffer (áudio bruto pronto para upload).
 * Instrui o modelo a locucionar o texto verbatim, sem comentários.
 */
export async function generateSpeechAbacus(
  params: AbacusSpeechParams
): Promise<Buffer> {
  if (!API_KEY) {
    throw new AbacusImageError("Provider de áudio não configurado", 500);
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model || "gpt-4o-audio-preview",
      modalities: ["text", "audio"],
      audio: { voice: params.voice || "alloy", format: "mp3" },
      messages: [
        {
          role: "system",
          content:
            "You are a professional voice actor. Read the user's text aloud exactly as written, verbatim. Do not add any words, comments, greetings or explanations.",
        },
        { role: "user", content: params.text },
      ],
    }),
  });

  const text = await res.text();
  let data: AudioChatResponse;
  try {
    data = JSON.parse(text) as AudioChatResponse;
  } catch {
    throw new AbacusImageError(
      `Resposta inválida do provedor de áudio (${res.status})`,
      res.status
    );
  }

  if (!res.ok) {
    const errMsg =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || `Erro ${res.status} do provedor de áudio`;
    throw new AbacusImageError(errMsg, res.status);
  }

  const msg = data.choices?.[0]?.message;
  const b64 = msg?.audios?.[0]?.data || msg?.audio?.data;
  if (!b64) {
    throw new AbacusImageError("Provedor não retornou áudio", 502);
  }
  return Buffer.from(b64, "base64");
}
