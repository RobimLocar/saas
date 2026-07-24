/**
 * PiAPI Client — Fluxyra
 * Cliente para integração com a API da PiAPI (geração de imagem/vídeo/áudio)
 * Docs: https://piapi.ai/docs
 */

const PIAPI_BASE_URL = "https://api.piapi.ai/api/v1";

export interface PiAPITaskResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  output?: {
    image_url?: string;
    video_url?: string;
    audio_url?: string;
    url?: string;
  };
  error?: string;
}

export interface PiAPIStatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  output?: {
    image_url?: string;
    video_url?: string;
    audio_url?: string;
    url?: string;
    images?: Array<{ url: string }>;
    videos?: Array<{ url: string }>;
  };
  meta?: Record<string, unknown>;
  error?: string;
}

class PiAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "PiAPIError";
  }
}

async function piapiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const apiKey = process.env.PIAPI_API_KEY;
  if (!apiKey) throw new PiAPIError("PIAPI_API_KEY não configurada");

  const res = await fetch(`${PIAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers || {}),
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new PiAPIError(
      data?.error || `PiAPI error ${res.status}`,
      res.status,
      data
    );
  }

  return data as T;
}

// ─── Geração de Imagem ──────────────────────────────────────────────────────

export interface ImageGenParams {
  model: string; // ex: 'flux-schnell', 'flux-dev', 'gpt-image-2'
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string; // '1:1' | '16:9' | '9:16' | '4:3'
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  reference_image_url?: string;
}

export async function generateImage(
  params: ImageGenParams
): Promise<PiAPITaskResponse> {
  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      task_type: "txt2img",
      input: {
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        width: params.width || 1024,
        height: params.height || 1024,
        aspect_ratio: params.aspect_ratio,
        num_inference_steps: params.num_inference_steps || 30,
        guidance_scale: params.guidance_scale || 7.5,
        seed: params.seed,
        image_url: params.reference_image_url,
      },
    }),
  });
}

// ─── Geração de Vídeo ───────────────────────────────────────────────────────

export interface VideoGenParams {
  model: string; // ex: 'kling-standard', 'seedance-2-fast', 'veo-3'
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  duration?: number; // segundos: 4, 5, 6, 8, 10
  resolution?: string; // '720p' | '1080p' | '4k'
  start_image_url?: string;
  end_image_url?: string;
  seed?: number;
}

export async function generateVideo(
  params: VideoGenParams
): Promise<PiAPITaskResponse> {
  const taskType = params.start_image_url ? "img2video" : "txt2video";

  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      task_type: taskType,
      input: {
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration: params.duration || 4,
        resolution: params.resolution || "1080p",
        start_image_url: params.start_image_url,
        end_image_url: params.end_image_url,
        seed: params.seed,
      },
    }),
  });
}

// ─── Geração de Áudio ───────────────────────────────────────────────────────

export interface AudioGenParams {
  model: string; // ex: 'ace-step', 'suno-chirp-v5', 'elevenlabs-v3'
  prompt: string; // letra/descrição da música OU texto para TTS
  duration?: number; // segundos (para música)
  voice_id?: string; // para TTS (ElevenLabs)
  language?: string; // para TTS
}

export async function generateAudio(
  params: AudioGenParams
): Promise<PiAPITaskResponse> {
  const isTTS = params.model.includes("elevenlabs") || params.model.includes("seed-audio");
  const taskType = isTTS ? "tts" : "txt2audio";

  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      task_type: taskType,
      input: {
        prompt: params.prompt,
        text: isTTS ? params.prompt : undefined,
        duration: params.duration,
        voice_id: params.voice_id,
        language: params.language || "pt-BR",
      },
    }),
  });
}

// ─── Status da Task ─────────────────────────────────────────────────────────

export async function getTaskStatus(
  taskId: string
): Promise<PiAPIStatusResponse> {
  return piapiFetch<PiAPIStatusResponse>(`/task/${taskId}`, {
    method: "GET",
  });
}

// ─── Extrair URL do resultado ───────────────────────────────────────────────

export function extractResultUrl(
  output: PiAPIStatusResponse["output"]
): string | null {
  if (!output) return null;
  return (
    output.url ||
    output.image_url ||
    output.video_url ||
    output.audio_url ||
    output.images?.[0]?.url ||
    output.videos?.[0]?.url ||
    null
  );
}
