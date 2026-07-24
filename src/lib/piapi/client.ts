/**
 * PiAPI Client — Fluxyra
 * Testado e validado contra a API real em 2026-07-24
 * Docs: https://piapi.ai/docs
 *
 * MODELOS CONFIRMADOS FUNCIONANDO (retestado em 2026-07-24 com saldo):
 *   Imagem : gpt-image-2 (síncrono, /v1/images/generations — texto perfeito),
 *            Qubico/flux1-schnell (txt2img), Qubico/flux1-dev (txt2img/img2img)
 *   Vídeo  : kling (video_generation, version+mode), hailuo (video_generation),
 *            luma (video_generation), Qubico/hunyuan (txt2video)
 *   Áudio  : music-u (generate_music — Udio real), Qubico/diffrhythm,
 *            Qubico/ace-step (txt2audio)
 *   INDISPONÍVEIS: midjourney ("no longer support MidJourney service"),
 *            kling 2.1 txt2video (só img2video), skyreels/wanx (task types inválidos)
 */

const PIAPI_BASE_URL = "https://api.piapi.ai/api/v1";
const PIAPI_OPENAI_BASE = "https://api.piapi.ai/v1";

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

// ─── Imagem premium (GPT Image 2 — síncrono) ────────────────────────────────
// Endpoint OpenAI-like da PiAPI: POST /v1/images/generations (Bearer).
// Validado em 2026-07-24: retorna data[0].b64_json (ou url). Texto perfeito.
export interface GptImageParams {
  prompt: string;
  aspect_ratio?: string;
  quality?: "low" | "medium" | "high";
}

/**
 * Gera imagem com o GPT Image 2 real da PiAPI (síncrono).
 * Retorna uma data-URL (base64) ou URL http, pronta para persistir no Storage.
 */
export async function generateImageGptSync(
  params: GptImageParams
): Promise<string> {
  const apiKey = process.env.PIAPI_API_KEY;
  if (!apiKey) throw new PiAPIError("PIAPI_API_KEY não configurada");

  // GPT Image aceita apenas 1024x1024, 1536x1024 (paisagem), 1024x1536 (retrato)
  const ar = params.aspect_ratio || "1:1";
  const [w, h] = ar.split(":").map(Number);
  const size =
    !w || !h || w === h
      ? "1024x1024"
      : w > h
        ? "1536x1024"
        : "1024x1536";

  const res = await fetch(`${PIAPI_OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: params.prompt,
      n: 1,
      size,
      quality: params.quality || "high",
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string; type?: string };
  } | null;

  if (!res.ok || data?.error || !data?.data?.length) {
    let msg =
      data?.error?.message || `PiAPI gpt-image error ${res.status}`;
    // Erros de content safety vêm embrulhados como "upstream returned 400: {...}"
    const m = msg.match(/upstream returned \d+: (\{.*\})/);
    if (m) {
      try {
        const inner = JSON.parse(m[1]) as { error?: { message?: string } };
        if (inner.error?.message) msg = inner.error.message;
      } catch {
        // mantém msg original
      }
    }
    throw new PiAPIError(msg, res.status, data);
  }

  const first = data.data[0];
  if (first.url) return first.url;
  if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
  throw new PiAPIError("Resposta do gpt-image sem imagem", res.status, data);
}

// ─── Vídeo ───────────────────────────────────────────────────────────────────
// Roteamento completo por backend conforme docs oficiais da PiAPI (2026-07).
// Cada modelo do catálogo (ai_models.params) traz: backend, task_type,
// kling_version/kling_mode, hailuo_model, output_key e dur_min/dur_max.
//
//   kling classic  → model=kling,       task_type=video_generation      → output.video_url
//   kling 3.0      → model=kling,       task_type=video_generation      → output.video
//   kling omni     → model=kling,       task_type=omni_video_generation → output.video
//   kling turbo    → model=kling-turbo, task_type=video_generation      → output.video_url
//   seedance       → model=seedance,    task_type=seedance-2[-fast|-mini]→ output.video_url
//   wan 2.6        → model=Wan,         task_type=wan26-txt2video        → output.video_url
//   hailuo         → model=hailuo,      task_type=video_generation       → output.video
//   veo3 / veo3.1  → model=veo3[.1],    task_type=veo3[.1]-video[-fast]  → output.video

export type Quality = "low" | "medium" | "high";

// Subconjunto de ai_models.params relevante para montar o payload de vídeo.
export interface VideoModelParams {
  backend?: string;
  task_type?: string;
  kling_version?: string;
  kling_mode?: string;
  hailuo_model?: string;
  output_key?: string;
  resolution?: string;
  dur_min?: number;
  dur_max?: number;
  [k: string]: unknown;
}

export interface BuildVideoArgs {
  params: VideoModelParams;
  prompt: string;
  quality: Quality;
  duration?: number;
  aspectRatio?: string;
  imageUrl?: string;
  negativePrompt?: string;
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(v)));

// Snap para o valor permitido mais próximo (ex.: Wan aceita apenas 5/10/15).
const snap = (v: number, allowed: number[]) =>
  allowed.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/**
 * Monta o corpo COMPLETO da requisição PiAPI (POST /task) para um modelo de
 * vídeo, respeitando as regras de cada backend. Sempre inclui
 * config.service_mode = "public".
 */
export function buildVideoPayload(args: BuildVideoArgs): Record<string, unknown> {
  const { params, prompt, quality, aspectRatio, imageUrl, negativePrompt } = args;
  const backend = params.backend || "kling";
  const config = { service_mode: "public" };
  const aspect = aspectRatio || "16:9";
  const durMin = params.dur_min ?? 5;
  const durMax = params.dur_max ?? 10;
  const userDur = clampInt(args.duration ?? durMin, durMin, durMax);

  // ── SEEDANCE ──────────────────────────────────────────────────────────────
  if (backend === "seedance") {
    const taskType = params.task_type || "seedance-2";
    // 1080p só no Pro (seedance-2); fast/mini limitam a 720p.
    let resolution = quality === "low" ? "480p" : quality === "medium" ? "720p" : "1080p";
    if (taskType !== "seedance-2" && resolution === "1080p") resolution = "720p";
    const input: Record<string, unknown> = {
      prompt,
      duration: userDur,
      resolution,
      aspect_ratio: aspect,
    };
    if (imageUrl) input.image_urls = [imageUrl];
    if (negativePrompt) input.negative_prompt = negativePrompt;
    return { model: "seedance", task_type: taskType, input, config };
  }

  // ── WAN 2.6 ────────────────────────────────────────────────────────────────
  if (backend === "Wan") {
    const resolution = quality === "high" ? "1080P" : "720P"; // P maiúsculo!
    const input: Record<string, unknown> = {
      prompt,
      duration: snap(userDur, [5, 10, 15]),
      resolution,
      aspect_ratio: aspect,
    };
    if (negativePrompt) input.negative_prompt = negativePrompt;
    return {
      model: "Wan",
      task_type: params.task_type || "wan26-txt2video",
      input,
      config,
    };
  }

  // ── HAILUO (MiniMax) ─────────────────────────────────────────────────────
  if (backend === "hailuo") {
    // low → 768/6s ; medium → 768/10s ; high → 1080/6s (nunca 1080+10!)
    const duration = quality === "medium" ? 10 : 6;
    const resolution = quality === "high" ? 1080 : 768;
    // Hailuo NÃO aceita aspect_ratio no input; o campo de imagem é image_url.
    const input: Record<string, unknown> = {
      model: params.hailuo_model || "v2.3",
      prompt,
      duration,
      resolution,
    };
    if (imageUrl) input.image_url = imageUrl;
    return { model: "hailuo", task_type: "video_generation", input, config };
  }

  // ── VEO 3 / VEO 3.1 ────────────────────────────────────────────────────────
  if (backend === "veo3" || backend === "veo3.1") {
    // low → 720p/4s ; medium → 720p/8s ; high → 1080p/8s
    const resolution = quality === "high" ? "1080p" : "720p";
    const durStr = quality === "low" ? "4s" : "8s";
    const input: Record<string, unknown> = {
      prompt,
      duration: durStr, // STRING com sufixo "s"
      resolution,
      aspect_ratio: aspect === "9:16" ? "9:16" : "16:9",
      generate_audio: true,
    };
    if (imageUrl) input.image_url = imageUrl;
    const defaultTask = backend === "veo3" ? "veo3-video" : "veo3.1-video";
    return {
      model: backend,
      task_type: params.task_type || defaultTask,
      input,
      config,
    };
  }

  // ── KLING TURBO (2.5-turbo) ─────────────────────────────────────────────
  if (backend === "kling-turbo") {
    const mode = quality === "high" ? "pro" : "standard";
    const duration = quality === "low" ? 5 : 10;
    const input: Record<string, unknown> = {
      prompt,
      version: params.kling_version || "2.5-turbo",
      mode,
      duration,
      aspect_ratio: aspect,
    };
    if (imageUrl) input.image_url = imageUrl;
    if (negativePrompt) input.negative_prompt = negativePrompt;
    return { model: "kling-turbo", task_type: "video_generation", input, config };
  }

  // ── KLING (classic / 3.0 / omni) ─────────────────────────────────────────
  const taskType = params.task_type || "video_generation";
  const version = params.kling_version || "1.6";

  // Kling Omni 3.0 — task_type diferente + resolution + enable_audio
  if (taskType === "omni_video_generation") {
    const resolution = quality === "high" ? "1080p" : "720p";
    const input: Record<string, unknown> = {
      prompt,
      version,
      duration: clampInt(userDur, 3, 15),
      resolution,
      aspect_ratio: aspect,
      enable_audio: false,
    };
    if (imageUrl) input.image_url = imageUrl;
    if (negativePrompt) input.negative_prompt = negativePrompt;
    return { model: "kling", task_type: "omni_video_generation", input, config };
  }

  // Kling 3.0 — mode std/pro, duração livre 3–15
  if (version === "3.0" || version === "3.0-turbo") {
    const mode = quality === "high" ? "pro" : "std";
    const input: Record<string, unknown> = {
      prompt,
      version,
      mode,
      duration: clampInt(userDur, 3, 15),
      aspect_ratio: aspect,
    };
    if (imageUrl) input.image_url = imageUrl;
    if (negativePrompt) input.negative_prompt = negativePrompt;
    return { model: "kling", task_type: "video_generation", input, config };
  }

  // Kling classic (1.5/1.6/2.1/2.5/2.6) — duração ENUM 5 ou 10
  const mode = quality === "high" ? "pro" : "standard";
  const duration = quality === "low" ? 5 : 10;
  const input: Record<string, unknown> = {
    prompt,
    version,
    mode,
    duration,
    aspect_ratio: aspect,
  };
  if (imageUrl) input.image_url = imageUrl;
  if (negativePrompt) input.negative_prompt = negativePrompt;
  return { model: "kling", task_type: "video_generation", input, config };
}

/**
 * Submete uma task de vídeo já montada (POST /task) e devolve o task_id.
 */
export async function submitVideoTask(
  payload: Record<string, unknown>
): Promise<PiAPITaskResponse> {
  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Extrai a URL do vídeo do output da PiAPI conforme o output_key do modelo.
 *   output.video      → output.video (string) | output.video.url
 *   output.video_url  → output.video_url
 * Sem output_key: tenta ambos.
 */
export function extractVideoUrl(
  output: PiAPIStatusResponse["data"]["output"],
  outputKey?: string
): string | null {
  if (!output) return null;
  const o = output as Record<string, unknown>;
  const asUrl = (v: unknown): string | null =>
    typeof v === "string"
      ? v
      : v && typeof v === "object" && typeof (v as { url?: string }).url === "string"
        ? (v as { url: string }).url
        : null;

  if (outputKey === "output.video") {
    return asUrl(o.video) || (typeof o.video_url === "string" ? o.video_url : null);
  }
  if (outputKey === "output.video_url") {
    return (typeof o.video_url === "string" ? o.video_url : null) || asUrl(o.video);
  }
  // fallback: tenta ambos
  return (typeof o.video_url === "string" ? o.video_url : null) || asUrl(o.video);
}

// ─── Áudio ───────────────────────────────────────────────────────────────────
// Qubico/ace-step → task_type="txt2audio", input.style_prompt + input.lyrics
export interface AudioGenParams {
  model: string;
  prompt: string;
  lyrics?: string;
  duration?: number;
  quality?: "low" | "medium" | "high";
  // Campos de TTS (usados pela rota de áudio para o motor de fala; a PiAPI
  // em si não os consome — TTS roda via generateSpeechAbacus).
  voice_id?: string;
  stability?: number;
  similarity?: number;
  speed?: number;
  elevenlabs_model?: string;
}

export async function generateAudio(
  params: AudioGenParams
): Promise<PiAPITaskResponse> {
  // music-u (Udio real) — validado: task_type generate_music
  if (params.model === "music-u") {
    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({
        model: "music-u",
        task_type: "generate_music",
        input: {
          gpt_description_prompt: params.prompt,
          lyrics_type: params.lyrics ? "user" : "instrumental",
          ...(params.lyrics ? { lyrics: params.lyrics } : {}),
        },
      }),
    });
  }

  if (params.model.includes("ace-step")) {
    // Qualidade → infer_step (mais passos = melhor qualidade / mais lento).
    const inferStep = { low: 30, medium: 60, high: 100 }[
      params.quality ?? "high"
    ];
    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({
        model: params.model,
        task_type: "txt2audio",
        input: {
          style_prompt: params.prompt,
          lyrics: params.lyrics || "",
          infer_step: inferStep,
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
  // luma: output.video / output.video_raw podem ser objetos { url }
  const o = output as Record<string, unknown>;
  const videoObj = (o.video ?? o.video_raw) as
    | { url?: string }
    | string
    | undefined;
  const videoObjUrl =
    videoObj && typeof videoObj === "object" ? videoObj.url : undefined;
  // music-u (Udio): output.songs[0].song_path
  const songs = o.songs as Array<{ song_path?: string }> | undefined;
  const songUrl = songs?.[0]?.song_path;

  return (
    output.url ||
    output.image_url ||
    output.video_url ||
    output.audio_url ||
    (typeof output.video === "string" ? output.video : undefined) ||
    videoObjUrl ||
    output.audio ||
    songUrl ||
    output.image ||
    output.images?.[0]?.url ||
    output.videos?.[0]?.url ||
    null
  );
}
