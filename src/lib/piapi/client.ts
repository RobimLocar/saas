/**
 * PiAPI Client — Fluxyra
 * Testado e validado contra a API real em 2026-07-24
 * Docs: https://piapi.ai/docs
 *
 * MODELOS CONFIRMADOS FUNCIONANDO:
 *   Imagem : Qubico/flux1-schnell (txt2img), Qubico/flux1-dev (txt2img)
 *   Vídeo  : kling (video_generation, version+mode nos params), hailuo (video_generation)
 *   Áudio  : Qubico/ace-step (txt2audio)
 */

const PIAPI_BASE_URL = "https://api.piapi.ai/api/v1";

export interface PiAPITaskResponse {
  code: number;
  data: {
    task_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    output?: {
      image_url?: string;
      video_url?: string;
      audio_url?: string;
      url?: string;
      image_base64?: string;
    };
    error?: { code: number; message: string };
  };
  message?: string;
}

export interface PiAPIStatusResponse {
  code: number;
  data: {
    task_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    output?: {
      image_url?: string;
      video_url?: string;
      audio_url?: string;
      url?: string;
      image?: string;
      video?: string;
      audio?: string;
      images?: Array<{ url: string }>;
      videos?: Array<{ url: string }>;
      image_base64?: string;
    };
    meta?: Record<string, unknown>;
    error?: { code: number; message: string };
  };
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

  if (!res.ok || (data?.code && data.code !== 200)) {
    const msg =
      data?.message ||
      data?.data?.error?.message ||
      `PiAPI error ${res.status}`;
    throw new PiAPIError(msg, res.status, data);
  }

  return data as T;
}

// ─── Imagem ─────────────────────────────────────────────────────────────────
// Modelos: Qubico/flux1-schnell | Qubico/flux1-dev
// task_type sempre: txt2img
export interface ImageGenParams {
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  seed?: number;
  reference_image_url?: string;
}

export async function generateImage(
  params: ImageGenParams
): Promise<PiAPITaskResponse> {
  const AR_DIMS: Record<string, { w: number; h: number }> = {
    "1:1":  { w: 1024, h: 1024 },
    "3:4":  { w: 896,  h: 1152 },
    "9:16": { w: 768,  h: 1344 },
    "4:3":  { w: 1152, h: 896  },
    "3:2":  { w: 1216, h: 832  },
    "16:9": { w: 1344, h: 768  },
  };
  const dims = params.aspect_ratio ? AR_DIMS[params.aspect_ratio] : undefined;
  const hasReference = Boolean(params.reference_image_url);

  // Com referência: task_type "img2img" + input.image (URL pública) + denoise.
  // Validado na PiAPI: txt2img ignora image_url silenciosamente; img2img respeita.
  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      task_type: hasReference ? "img2img" : "txt2img",
      input: {
        prompt: params.prompt,
        negative_prompt: params.negative_prompt || "",
        width: params.width || dims?.w || 1024,
        height: params.height || dims?.h || 1024,
        ...(hasReference
          ? { image: params.reference_image_url, denoise: 0.7 }
          : {}),
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
      },
    }),
  });
}

// ─── Vídeo ───────────────────────────────────────────────────────────────────
// kling  → model="kling", task_type="video_generation", input.version + input.mode
// hailuo → model="hailuo", task_type="video_generation"
// Os parâmetros version/mode são extraídos do campo params da tabela ai_models
export interface VideoGenParams {
  model: string;             // "kling" ou "hailuo"
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  duration?: number;
  resolution?: string;
  start_image_url?: string;
  end_image_url?: string;
  seed?: number;
  // Kling-específico (vem do campo params da tabela ai_models)
  kling_version?: string;    // "1.0" | "1.5" | "1.6" | "2.1"
  kling_mode?: string;       // "standard" | "pro" | "master"
}

export async function generateVideo(
  params: VideoGenParams
): Promise<PiAPITaskResponse> {
  if (params.model === "kling") {
    // PiAPI: kling 2.1 só suporta img2video ("text-to-video generation is not
    // available in version 2.1"). Sem imagem inicial, cai para 1.6 (mesmo mode).
    let version = params.kling_version || "1.6";
    if (version === "2.1" && !params.start_image_url) {
      version = "1.6";
    }
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration || 5,
      aspect_ratio: params.aspect_ratio || "16:9",
      version,
      mode: params.kling_mode || "standard",
    };
    if (params.negative_prompt) input.negative_prompt = params.negative_prompt;
    if (params.start_image_url) input.image = params.start_image_url;
    if (params.seed !== undefined) input.seed = params.seed;

    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({
        model: "kling",
        task_type: "video_generation",
        input,
      }),
    });
  }

  if (params.model === "hailuo") {
    const taskType = params.start_image_url ? "txt2video" : "video_generation";
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration || 6,
      aspect_ratio: params.aspect_ratio || "16:9",
    };
    if (params.start_image_url) input.first_frame_image = params.start_image_url;

    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({ model: "hailuo", task_type: taskType, input }),
    });
  }

  // Fallback genérico (outros modelos futuros)
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
        duration: params.duration || 5,
        ...(params.start_image_url ? { image: params.start_image_url } : {}),
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
      },
    }),
  });
}

// ─── Áudio ───────────────────────────────────────────────────────────────────
// Qubico/ace-step → task_type="txt2audio", input.style_prompt + input.lyrics
export interface AudioGenParams {
  model: string;
  prompt: string;
  lyrics?: string;
  duration?: number;
}

export async function generateAudio(
  params: AudioGenParams
): Promise<PiAPITaskResponse> {
  if (params.model.includes("ace-step")) {
    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({
        model: params.model,
        task_type: "txt2audio",
        input: {
          style_prompt: params.prompt,
          lyrics: params.lyrics || "",
        },
      }),
    });
  }

  // Fallback
  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      task_type: "txt2audio",
      input: { prompt: params.prompt },
    }),
  });
}

// ─── Status da Task ──────────────────────────────────────────────────────────
export async function getTaskStatus(
  taskId: string
): Promise<PiAPIStatusResponse> {
  return piapiFetch<PiAPIStatusResponse>(`/task/${taskId}`, { method: "GET" });
}

// ─── Extrair URL do resultado ────────────────────────────────────────────────
export function extractResultUrl(
  output: PiAPIStatusResponse["data"]["output"]
): string | null {
  if (!output) return null;
  return (
    output.url ||
    output.image_url ||
    output.video_url ||
    output.audio_url ||
    output.video ||
    output.audio ||
    output.image ||
    output.images?.[0]?.url ||
    output.videos?.[0]?.url ||
    null
  );
}
