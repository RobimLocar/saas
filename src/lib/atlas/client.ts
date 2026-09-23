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

function isInsufficientBalance(status: number, r: AtlasResponse): boolean {
  return status === 402 || Number(r.code) === 402;
}

// ── P11a — TRANSPORTE GENÉRICO ────────────────────────────────────────────────
// Endpoints oficiais Atlas: POST /api/v1/model/generate{Image,Video,Audio} + poll
// GET /api/v1/model/prediction/{id}. Auth Bearer. Mesma casca para todas as
// modalidades. NUNCA logar a API key.

export type AtlasEndpoint = "generateImage" | "generateVideo" | "generateAudio";

/** Predição normalizada (agnóstica de modalidade). `outputs` são strings cruas
 *  (URLs de mídia OU texto) — o TIPO é definido pelo profile do modelo, não aqui. */
export interface AtlasPrediction {
  status: "processing" | "completed" | "failed";
  outputs: string[];
  error: string | null;
}

/** Resultado do submit: id/pollRef para o status compartilhado + outputs imediatos. */
export interface AtlasSubmitResult {
  ok: boolean;
  httpStatus: number;
  predictionId: string | null;
  pollRef: string | null; // URL completa OU id p/ polling posterior
  immediateOutputs: string[];
  error: string | null;
}

function requireKey(): void {
  if (!API_KEY) {
    throw new AtlasError(
      "Chave do Atlas não configurada. Adicione ATLAS_API_KEY ao .env.local.",
      503
    );
  }
}

function normalizeStatus(s?: string): AtlasPrediction["status"] {
  const v = (s || "").toLowerCase();
  if (v === "completed" || v === "succeeded" || v === "success") return "completed";
  if (v === "failed" || v === "timeout" || v === "error" || v === "canceled")
    return "failed";
  return "processing";
}

function toPrediction(d?: AtlasPredictionData): AtlasPrediction {
  const outputs = Array.isArray(d?.outputs)
    ? d!.outputs!.filter((o): o is string => typeof o === "string" && o.length > 0)
    : [];
  const status = normalizeStatus(d?.status);
  // Se já veio output e não é falha, tratamos como completed (algumas respostas
  // síncronas não trazem `status`).
  if (outputs.length > 0 && status !== "failed") return { status: "completed", outputs, error: null };
  return { status, outputs, error: d?.error ?? null };
}

/** POST genérico para um endpoint de geração Atlas. Body já montado pelo profile. */
async function atlasSubmit(
  endpoint: AtlasEndpoint,
  body: Record<string, unknown>
): Promise<AtlasSubmitResult> {
  requireKey();
  const res = await fetch(`${BASE_URL}/api/v1/model/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await parseJson(res);
  if (isInsufficientBalance(res.status, j)) {
    throw new AtlasError(
      "Saldo insuficiente na conta Atlas. Adicione créditos em atlascloud.ai.",
      402
    );
  }
  if (!res.ok || Number(j.code) >= 400) {
    return {
      ok: false,
      httpStatus: res.status || 502,
      predictionId: null,
      pollRef: null,
      immediateOutputs: [],
      error: j.message || j.msg || `Erro ${res.status} do provedor Atlas`,
    };
  }
  const d = j.data;
  const pred = toPrediction(d);
  const pollRef =
    d?.urls?.get || (d?.id ? `${BASE_URL}/api/v1/model/prediction/${d.id}` : null);
  return {
    ok: true,
    httpStatus: res.status,
    predictionId: d?.id ?? null,
    pollRef,
    immediateOutputs: pred.outputs,
    error: null,
  };
}

export function submitAtlasImage(body: Record<string, unknown>): Promise<AtlasSubmitResult> {
  return atlasSubmit("generateImage", body);
}
export function submitAtlasVideo(body: Record<string, unknown>): Promise<AtlasSubmitResult> {
  return atlasSubmit("generateVideo", body);
}
export function submitAtlasAudio(body: Record<string, unknown>): Promise<AtlasSubmitResult> {
  return atlasSubmit("generateAudio", body);
}

/** Poll ÚNICO de uma predição (id ou URL completa) → predição normalizada.
 *  Usado pela rota de status COMPARTILHADA (sem status route específica de Atlas). */
export async function getAtlasPrediction(pollRef: string): Promise<AtlasPrediction> {
  requireKey();
  const url = /^https?:\/\//i.test(pollRef)
    ? pollRef
    : `${BASE_URL}/api/v1/model/prediction/${pollRef}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const j = await parseJson(res);
  return toPrediction(j.data);
}

/**
 * Sintetiza fala via Atlas Cloud (ElevenLabs v3) e retorna a URL do áudio.
 * Comportamento INALTERADO (P11a apenas reusa o transporte genérico). Polling
 * síncrono interno até concluir. Lança AtlasError em falhas.
 */
export async function generateSpeechAtlas(
  params: AtlasSpeechParams
): Promise<string> {
  const submit = await atlasSubmit("generateAudio", {
    model: params.model || DEFAULT_TTS_MODEL,
    text: params.text,
    voice: params.voice,
    stability: typeof params.stability === "number" ? params.stability : 0.5,
    apply_text_normalization: "auto",
  });

  if (!submit.ok) {
    throw new AtlasError(submit.error || "Erro do provedor de áudio", submit.httpStatus);
  }
  if (submit.immediateOutputs[0]) return submit.immediateOutputs[0];
  if (!submit.pollRef) {
    throw new AtlasError("Provedor não retornou identificador da geração", 502);
  }

  const deadline = Date.now() + 120_000; // 2 min
  while (Date.now() < deadline) {
    await sleep(1500);
    const pred = await getAtlasPrediction(submit.pollRef);
    if (pred.outputs[0]) return pred.outputs[0];
    if (pred.status === "failed") {
      throw new AtlasError(pred.error || "A geração de áudio falhou no provedor", 502);
    }
  }
  throw new AtlasError("Tempo limite ao gerar o áudio", 504);
}
