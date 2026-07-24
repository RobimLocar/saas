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
  // Nível de qualidade selecionado no dock (low | medium | high)
  quality?: "low" | "medium" | "high";
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
    // Hailuo (MiniMax) aceita resolution 768 | 1080. Quality → resolução:
    //   low/medium → 768 ; high → 1080 (1080p + 10s não é suportado)
    const hiRes = params.quality === "high" && (params.duration || 6) <= 6;
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration || 6,
      aspect_ratio: params.aspect_ratio || "16:9",
      resolution: hiRes ? 1080 : 768,
    };
    if (params.start_image_url) input.first_frame_image = params.start_image_url;

    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({ model: "hailuo", task_type: taskType, input }),
    });
  }

  // luma (Dream Machine) — validado: task_type video_generation
  if (params.model === "luma") {
    // Luma não expõe resolução; o ganho de qualidade vem do "Enhance Prompt"
    // (expand_prompt). Habilitamos em medium/high.
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration || 5,
      aspect_ratio: params.aspect_ratio || "16:9",
      expand_prompt: params.quality !== "low",
    };
    if (params.start_image_url) {
      input.key_frames = {
        frame0: { type: "image", url: params.start_image_url },
        ...(params.end_image_url
          ? { frame1: { type: "image", url: params.end_image_url } }
          : {}),
      };
    }
    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({ model: "luma", task_type: "video_generation", input }),
    });
  }

  // Qubico/hunyuan — validado: task_type txt2video (só prompt)
  if (params.model === "Qubico/hunyuan") {
    return piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify({
        model: "Qubico/hunyuan",
        task_type: "txt2video",
        input: { prompt: params.prompt },
      }),
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
