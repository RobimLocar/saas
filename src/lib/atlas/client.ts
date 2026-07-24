// Cliente do Atlas Cloud (api.atlascloud.ai) — "One API for All Media AI".
// Usado para geração de voz (TTS) através do modelo ElevenLabs v3.
//
// Fluxo do endpoint de áudio (assíncrono):
//   POST /api/v1/model/generateAudio  → { data: { id, status, outputs, urls.get } }
//   GET  /api/v1/model/prediction/{id} → poll até status "completed"
// A saída é uma URL de arquivo (mp3/wav) hospedada pelo próprio Atlas.
//
// NUNCA logar a chave (ATLAS_API_KEY).

const BASE_URL = "https://api.atlascloud.ai";
const API_KEY = process.env.ATLAS_API_KEY || "";
const DEFAULT_TTS_MODEL = "elevenlabs/v3/text-to-speech";

export class AtlasError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AtlasError";
    this.status = status;
  }
}

export interface AtlasSpeechParams {
  text: string;
  voice: string; // voice id aceito pelo Atlas (ElevenLabs)
  model?: string; // default: elevenlabs/v3/text-to-speech
  stability?: number; // 0–1 (único parâmetro de voz suportado pelo ElevenLabs v3)
}

interface AtlasPredictionData {
  id?: string;
  status?: string; // created | processing | completed | timeout | failed
  outputs?: string[] | null;
  urls?: { get?: string };
  error?: string;
  error_code?: number;
}

interface AtlasResponse {
  code?: number | string;
  msg?: string;
  message?: string;
  data?: AtlasPredictionData;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseJson(res: Response): Promise<AtlasResponse> {
  const text = await res.text();
  try {
    return JSON.parse(text) as AtlasResponse;
  } catch {
    throw new AtlasError(
      `Resposta inválida do provedor de áudio (${res.status})`,
      res.status || 502
    );
  }
}

/** Extrai a URL de saída quando a predição terminou. */
function pickOutput(d?: AtlasPredictionData): string | null {
  if (d && Array.isArray(d.outputs) && d.outputs.length > 0 && d.outputs[0]) {
    return d.outputs[0];
  }
  return null;
}

function isInsufficientBalance(status: number, r: AtlasResponse): boolean {
  return status === 402 || Number(r.code) === 402;
}

/**
 * Sintetiza fala via Atlas Cloud (ElevenLabs v3) e retorna a URL do áudio.
 * Faz polling até a predição concluir. Lança AtlasError em falhas.
 */
export async function generateSpeechAtlas(
  params: AtlasSpeechParams
): Promise<string> {
  if (!API_KEY) {
    throw new AtlasError(
      "Chave do Atlas não configurada. Adicione ATLAS_API_KEY ao .env.local.",
      503
    );
  }

  const submitRes = await fetch(`${BASE_URL}/api/v1/model/generateAudio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_TTS_MODEL,
      text: params.text,
      voice: params.voice,
      stability: typeof params.stability === "number" ? params.stability : 0.5,
      apply_text_normalization: "auto",
    }),
  });

  const first = await parseJson(submitRes);

  if (isInsufficientBalance(submitRes.status, first)) {
    throw new AtlasError(
      "Saldo insuficiente na conta Atlas para gerar áudio. Adicione créditos em atlascloud.ai.",
      402
    );
  }
  if (!submitRes.ok || Number(first.code) >= 400) {
    throw new AtlasError(
      first.message || first.msg || `Erro ${submitRes.status} do provedor de áudio`,
      submitRes.status || 502
    );
  }

  // Já concluído na resposta inicial?
  const immediate = pickOutput(first.data);
  if (immediate) return immediate;

  const pollUrl =
    first.data?.urls?.get ||
    (first.data?.id
      ? `${BASE_URL}/api/v1/model/prediction/${first.data.id}`
      : null);

  if (!pollUrl) {
    throw new AtlasError("Provedor não retornou identificador da geração", 502);
  }

  const deadline = Date.now() + 120_000; // 2 min
  while (Date.now() < deadline) {
    await sleep(1500);
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const j = await parseJson(pollRes);
    const d = j.data;
    const out = pickOutput(d);
    if (out) return out;
    const status = d?.status;
    if (status === "failed" || status === "timeout") {
      throw new AtlasError(
        d?.error || "A geração de áudio falhou no provedor",
        502
      );
    }
  }

  throw new AtlasError("Tempo limite ao gerar o áudio", 504);
}
