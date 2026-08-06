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

import { auditLog, maskSecret, truncate } from "@/lib/audit-log";

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
    // PiAPI inclui um array de logs detalhando o processamento e a causa real
    // de falhas (ex.: "real person", "content restriction", "plan limit").
    logs?: string[];
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
  init?: RequestInit,
  requestId = "-"
): Promise<T> {
  const apiKey = process.env.PIAPI_API_KEY;
  if (!apiKey) throw new PiAPIError("PIAPI_API_KEY não configurada");

  const t0 = Date.now();
  // AUDIT: request completo à PiAPI (API key MASCARADA — nunca logar o valor real)
  auditLog("piapi.fetch", "request", requestId, {
    method: init?.method || "GET",
    url: `${PIAPI_BASE_URL}${path}`,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": maskSecret(apiKey),
    },
    body: truncate(typeof init?.body === "string" ? init.body : undefined, 4000),
  });

  let res: Response;
  try {
    res = await fetch(`${PIAPI_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...(init?.headers || {}),
      },
    });
  } catch (netErr) {
    auditLog("piapi.fetch", "network_error", requestId, {
      url: `${PIAPI_BASE_URL}${path}`,
      error: netErr instanceof Error ? netErr.message : String(netErr),
    }, Date.now() - t0);
    throw netErr;
  }

  // A PiAPI passa por Cloudflare. Quando sobrecarregada / sob challenge, ela
  // pode responder com HTML (challenge page) em vez de JSON. Chamar res.json()
  // direto explode com SyntaxError ("Unexpected token '<'"). Verificamos o
  // Content-Type e lemos como texto primeiro para tratar esses casos.
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();
  let data: any;
  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Header diz JSON, mas o corpo é inválido.
      auditLog("piapi.fetch", "parse_error", requestId, {
        url: `${PIAPI_BASE_URL}${path}`,
        http_status: res.status,
        content_type: contentType,
        raw_preview: rawText.slice(0, 300),
      }, Date.now() - t0);
      throw new PiAPIError(
        `Provider retornou JSON inválido (HTTP ${res.status}). Tente novamente em alguns instantes.`,
        502,
        { raw: rawText.slice(0, 500) }
      );
    }
  } else {
    // Conteúdo não-JSON (HTML de challenge Cloudflare, XML, texto puro, etc.).
    auditLog("piapi.fetch", "non_json_response", requestId, {
      url: `${PIAPI_BASE_URL}${path}`,
      http_status: res.status,
      content_type: contentType,
      raw_preview: rawText.slice(0, 300),
    }, Date.now() - t0);
    throw new PiAPIError(
      `Provider temporariamente indisponível (HTTP ${res.status}, recebeu ${contentType || "HTML"} em vez de JSON). Tente novamente em alguns instantes.`,
      503,
      { raw: rawText.slice(0, 500) }
    );
  }

  // AUDIT: response completa da PiAPI (inclui logs[] quando presentes)
  auditLog("piapi.fetch", "response", requestId, {
    url: `${PIAPI_BASE_URL}${path}`,
    http_status: res.status,
    ok: res.ok,
    body: truncate(JSON.stringify(data), 8000),
  }, Date.now() - t0);

  if (!res.ok || (data?.code && data.code !== 200)) {
    const msg =
      data?.message ||
      data?.data?.error?.message ||
      `PiAPI error ${res.status}`;
    auditLog("piapi.fetch", "error", requestId, {
      http_status: res.status,
      message: msg,
    }, Date.now() - t0);
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

// ─── Imagem Gemini / Nano Banana (assíncrono via /task) ─────────────────────
// Docs oficiais PiAPI: POST /task { model:"gemini", task_type, input:{ prompt,
// image_urls[], aspect_ratio, resolution, output_format } }. Suporta EDIÇÃO e
// FUSÃO multi-imagem (troca de avatar, pessoa + produto) via input.image_urls.
// A saída sai em output.image_urls[] (lida pelo extractResultUrl no polling).
export interface GeminiImageArgs {
  taskType: string; // "nano-banana-pro" | "gemini-2.5-flash-image" | "nano-banana-2"
  prompt: string;
  imageUrls?: string[]; // 1+ referências → fusão/edição
  aspectRatio?: string; // "1:1" | "9:16" | "16:9" ...
  resolution?: string; // "1K" | "2K" | "4K" (só nano-banana-pro)
  outputFormat?: string; // "png" (default)
}

export async function submitGeminiImageTask(
  args: GeminiImageArgs
): Promise<PiAPITaskResponse> {
  const input: Record<string, unknown> = {
    prompt: args.prompt,
    output_format: args.outputFormat || "png",
    safety_level: "high",
  };
  if (args.aspectRatio) input.aspect_ratio = args.aspectRatio;
  if (args.resolution) input.resolution = args.resolution;
  if (args.imageUrls && args.imageUrls.length > 0) {
    input.image_urls = args.imageUrls.slice(0, 6);
  }
  return piapiFetch<PiAPITaskResponse>("/task", {
    method: "POST",
    body: JSON.stringify({
      model: "gemini",
      task_type: args.taskType,
      input,
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
  reference_image_url?: string; // URL pública da imagem de referência (aceita por gpt-image-2)
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

  const reqBody: Record<string, unknown> = {
    model: "gpt-image-2",
    prompt: params.prompt,
    n: 1,
    size,
    // Doc oficial PiAPI: gpt-image-2 suporta APENAS quality "medium".
    quality: "medium",
  };
  // Imagem de referência — aceita como "image" no body JSON (validado PiAPI 2026-07)
  if (params.reference_image_url) {
    reqBody.image = params.reference_image_url;
  }

  const res = await fetch(`${PIAPI_OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
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
//   wan 2.6        → model=Wan,         task_type=wan26-txt2video/img2video → output.video_url
//                    (img2video usa campo "image"; txt2video usa aspect_ratio)
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
  /** quando true, o backend usa a variante "-less-restriction" do Seedance. */
  less_restriction?: boolean;
  /** tier do Seedance definido no catálogo ("pro" | "fast" | "mini"). */
  seedance_tier?: "pro" | "fast" | "mini";
  [k: string]: unknown;
}

export interface BuildVideoArgs {
  params: VideoModelParams;
  prompt: string;
  quality: Quality;
  duration?: number;
  /** resolução escolhida pelo usuário (ex.: "480p" | "720p" | "1080p"); tem
   *  prioridade sobre a derivada de `quality`. */
  resolution?: string;
  aspectRatio?: string;
  imageUrl?: string;
  endImageUrl?: string;
  dubbingAudioUrl?: string;
  /** força o task type "-less-restriction" independentemente de haver imagem
   *  (ex.: quando o modelo do catálogo tem params.less_restriction === true). */
  lessRestriction?: boolean;
  /** tier explícito do Seedance ("pro" = padrão/seedance-2). */
  seedanceTier?: "pro" | "fast" | "mini";
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
  shots?: Array<{ prompt: string; duration: number }>;
  withAudio?: boolean;
  negativePrompt?: string;
  /** id de correlação para logging estruturado da auditoria */
  requestId?: string;
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
  const rid = args.requestId || "-";
  // AUDIT: entrada do adapter (parâmetros normalizados do modelo + do usuário)
  auditLog("piapi.buildVideoPayload", "entrada", rid, {
    backend: args.params.backend,
    task_type: args.params.task_type,
    prompt_preview: typeof args.prompt === "string" ? args.prompt.slice(0, 80) : args.prompt,
    quality: args.quality,
    duration: args.duration,
    aspectRatio: args.aspectRatio,
    has_imageUrl: Boolean(args.imageUrl),
    has_endImageUrl: Boolean(args.endImageUrl),
    referenceImages: args.referenceImages?.length || 0,
    referenceVideos: args.referenceVideos?.length || 0,
    referenceAudios: args.referenceAudios?.length || 0,
    shots: args.shots?.length || 0,
    withAudio: args.withAudio,
    has_negativePrompt: Boolean(args.negativePrompt),
  });
  const payload = buildVideoPayloadInner(args);
  // AUDIT: saída do adapter (payload final que será enviado à PiAPI)
  auditLog("piapi.buildVideoPayload", "saida", rid, {
    task_type: payload.task_type,
    less_restriction:
      typeof payload.task_type === "string" && payload.task_type.includes("less-restriction"),
    auto_upload_assets: Boolean(
      (payload as { input?: { auto_upload_assets?: unknown } }).input?.auto_upload_assets
    ),
    payload: JSON.parse(JSON.stringify(payload, (k, v) => truncate(v, 500))),
  });
  return payload;
}

function buildVideoPayloadInner(args: BuildVideoArgs): Record<string, unknown> {
  const {
    params,
    prompt,
    quality,
    aspectRatio,
    imageUrl,
    endImageUrl,
    referenceImages,
    referenceVideos,
    referenceAudios,
    negativePrompt,
  } = args;
  const backend = params.backend || "kling";
  // config.service_mode = "public" (obrigatório). Quando PUBLIC_BASE_URL e
  // PIAPI_WEBHOOK_SECRET estão definidos, registramos o webhook para que a PiAPI
  // notifique nosso endpoint ao concluir/falhar a task (evita depender só de polling).
  const config: Record<string, unknown> = { service_mode: "public" };
  if (process.env.PUBLIC_BASE_URL && process.env.PIAPI_WEBHOOK_SECRET) {
    config.webhook_config = {
      endpoint: `${process.env.PUBLIC_BASE_URL}/api/webhooks/piapi`,
      secret: process.env.PIAPI_WEBHOOK_SECRET,
    };
  }
  const aspect = aspectRatio || "16:9";
  const durMin = params.dur_min ?? 5;
  const durMax = params.dur_max ?? 10;
  const userDur = clampInt(args.duration ?? durMin, durMin, durMax);

  // ── KLING AVATAR ─────────────────────────────────────────────────────────────
  // task_type="avatar" → lip-sync; requer image_url (retrato) + local_dubbing_url (áudio TTS).
  // mode: std = 720p/padrão, pro = melhor qualidade (usa quality do caller).
  // batch_size: 2 quando há Multiple Camera Angles (referenceImages.length > 1), senão 1.
  if (backend === "kling" && params.task_type === "avatar") {
    return {
      model: "kling",
      task_type: "avatar",
      input: {
        image_url: imageUrl,
        local_dubbing_url: args.dubbingAudioUrl,
        prompt: prompt || "A person speaking naturally and warmly to camera, UGC style.",
        mode: quality === "high" ? "pro" : "std",
        batch_size: args.referenceImages && args.referenceImages.length > 1 ? 2 : 1,
      },
      config,
    };
  }

  // ── SEEDANCE ──────────────────────────────────────────────────────────────
  if (backend === "seedance") {
    // Coleta todas as imagens de referência (start/end frames ou omni-reference).
    const imgUrls: string[] = [];
    if (referenceImages && referenceImages.length > 0) {
      // Omni Reference: usa todas as imagens (até 9) diretamente.
      imgUrls.push(...referenceImages.slice(0, 9));
    } else {
      // Start / End Frame: 1 ou 2 imagens.
      if (imageUrl) imgUrls.push(imageUrl);
      if (endImageUrl) imgUrls.push(endImageUrl);
    }
    const hasImages = imgUrls.length > 0;

    // ── Seedance 2.5 (preview) ────────────────────────────────────────────
    // task_type único "seedance-2.5" (sem split VIP, sem "-less-restriction",
    // sem tier). Só 480p/720p (1080p é rejeitado). Suporta image_urls (até 9),
    // video_urls (até 3) e audio_urls (até 3; exigem ao menos 1 imagem/vídeo).
    if ((params.task_type || "").includes("2.5")) {
      let res25 = args.resolution || (quality === "low" ? "480p" : "720p");
      if (res25 !== "480p" && res25 !== "720p") res25 = "720p";
      const input25: Record<string, unknown> = {
        prompt,
        duration: userDur,
        resolution: res25,
        aspect_ratio: aspect,
      };
      if (imgUrls.length > 0) input25.image_urls = imgUrls.slice(0, 9);
      if (referenceVideos && referenceVideos.length > 0) {
        input25.video_urls = referenceVideos.slice(0, 3);
      }
      if (
        referenceAudios &&
        referenceAudios.length > 0 &&
        (imgUrls.length > 0 || (referenceVideos && referenceVideos.length > 0))
      ) {
        input25.audio_urls = referenceAudios.slice(0, 3);
      }
      if (negativePrompt) input25.negative_prompt = negativePrompt;
      return {
        model: "seedance",
        task_type: "seedance-2.5",
        input: input25,
        config,
      };
    }

    // Política: qualquer geração COM imagem de referência vai para a variante
    // "-less-restriction". A variante estrita bloqueia rostos reais e não há
    // como saber de antemão se a imagem enviada contém uma pessoa real — então
    // preferimos a variante menos restritiva sempre que há imagem. Também pode
    // ser forçada explicitamente (args.lessRestriction, vindo do catálogo).
    const useLR = args.lessRestriction === true || hasImages;

    // Tier: catálogo (seedanceTier) tem prioridade; senão infere do task_type.
    const base =
      args.seedanceTier === "fast"
        ? "seedance-2-fast"
        : args.seedanceTier === "mini"
        ? "seedance-2-mini"
        : args.seedanceTier === "pro"
        ? "seedance-2"
        : // sem tier explícito: usa o task_type do catálogo como base, removendo
          // um eventual sufixo "-less-restriction" para reconstruir de forma limpa.
          (params.task_type || "seedance-2").replace(/-less-restriction$/, "");
    const taskType = useLR ? `${base}-less-restriction` : base;

    // Resolução SEMPRE explícita (o default da PiAPI mudou para 480p).
    // args.resolution tem prioridade; fallback por quality. fast/mini não
    // suportam 1080p → rebaixa para 720p.
    let resolution =
      args.resolution || (quality === "low" ? "480p" : quality === "medium" ? "720p" : "1080p");
    if ((base.includes("fast") || base.includes("mini")) && resolution === "1080p") {
      resolution = "720p";
    }

    const input: Record<string, unknown> = {
      prompt,
      duration: userDur,
      resolution,
      aspect_ratio: aspect,
    };
    // image_urls: 1 imagem = first frame; 2 imagens = first+last frame;
    // com video_urls/audio_urls = omni_reference. O modo é inferido pela PiAPI.
    if (imgUrls.length > 0) input.image_urls = imgUrls;
    if (referenceVideos && referenceVideos.length > 0) {
      input.video_urls = referenceVideos;
    }
    // audio_urls só é aceito quando há image_urls ou video_urls.
    if (
      referenceAudios &&
      referenceAudios.length > 0 &&
      (imgUrls.length > 0 || (referenceVideos && referenceVideos.length > 0))
    ) {
      input.audio_urls = referenceAudios;
    }
    if (negativePrompt) input.negative_prompt = negativePrompt;
    // auto_upload_assets: só na variante less-restriction COM imagens. Esse flag
    // pede que a PiAPI hospede internamente os assets de referência (necessário
    // para o pipeline less-restriction). asset_retention_hours limita a retenção.
    if (useLR && hasImages) {
      input.auto_upload_assets = true;
      input.asset_retention_hours = 3;
    }
    const seedancePayload: Record<string, unknown> = {
      model: "seedance",
      task_type: taskType,
      input,
      config,
    };
    return seedancePayload;
  }

  // ── WAN 2.6 ────────────────────────────────────────────────────────────────
  if (backend === "Wan") {
    // Wan aceita 720P / 1080P (P maiúsculo). Respeita a escolha do usuário; 480p
    // não é suportado pela Wan → sobe para 720P.
    let resolution = (args.resolution || (quality === "high" ? "1080p" : "720p")).toUpperCase();
    if (resolution === "480P") resolution = "720P";
    const hasImage = Boolean(imageUrl);
    const input: Record<string, unknown> = {
      prompt,
      duration: snap(userDur, [5, 10, 15]),
      resolution,
      watermark: false,
      ...(hasImage ? {} : { aspect_ratio: aspect }), // aspect_ratio não é suportado em img2video
    };
    if (imageUrl) input.image = imageUrl; // campo correto: "image", não "image_url"
    if (negativePrompt) input.negative_prompt = negativePrompt;
    // Audio: usa audio_url externo se fornecido; senão gera áudio nativo por padrão.
    if (referenceAudios && referenceAudios.length > 0) {
      input.audio_url = referenceAudios[0];
      input.audio = true;
    } else {
      input.audio = args.withAudio ?? true;
    }
    return {
      model: "Wan",
      task_type: hasImage ? "wan26-img2video" : (params.task_type || "wan26-txt2video"),
      input,
      config,
    };
  }

  // ── HAILUO (MiniMax) ─────────────────────────────────────────────────────
  if (backend === "hailuo") {
    // Duração válida: 6 ou 10 — snap conforme o pedido do usuário.
    const hailuoDur = userDur <= 8 ? 6 : 10;
    // Hailuo usa resolução NUMÉRICA (1080 ou 768) por limitação do provider.
    // Respeita a escolha do usuário quando viável: 1080 só é aceito com
    // duration=6 (1080+10 não existe na PiAPI); caso contrário cai para 768.
    const wants1080 = args.resolution
      ? args.resolution.includes("1080")
      : quality === "high";
    const resolution = wants1080 && hailuoDur === 6 ? 1080 : 768;
    // Hailuo NÃO aceita aspect_ratio no input; o campo de imagem é image_url.
    const input: Record<string, unknown> = {
      model: params.hailuo_model || "v2.3",
      prompt,
      duration: hailuoDur,
      resolution,
    };
    if (imageUrl) input.image_url = imageUrl;
    return { model: "hailuo", task_type: "video_generation", input, config };
  }

  // ── VEO 3 / VEO 3.1 ────────────────────────────────────────────────────────
  if (backend === "veo3" || backend === "veo3.1") {
    // Respeita a resolução do usuário; Veo3 aceita 720p/1080p → 480p sobe p/ 720p.
    let resolution = args.resolution || (quality === "high" ? "1080p" : "720p");
    if (resolution === "480p") resolution = "720p";
    // duração válida: [4, 6, 8] — snap ao mais próximo do pedido, formatado como "Xs"
    const veoDur = snap(userDur, [4, 6, 8]);
    const durStr = `${veoDur}s`; // STRING com sufixo "s"
    const input: Record<string, unknown> = {
      prompt,
      duration: durStr,
      resolution,
      // Veo3 aceita mais que 16:9/9:16 (doc ecoa 1:1). Whitelist conservadora;
      // confirme a lista completa numa geração real antes de ampliar.
      aspect_ratio: ["16:9", "9:16", "1:1"].includes(aspect) ? aspect : "16:9",
      generate_audio: args.withAudio ?? Boolean(params.has_audio),
    };
    if (negativePrompt) input.negative_prompt = negativePrompt;
    if (imageUrl) input.image_url = imageUrl;
    const defaultTask = backend === "veo3" ? "veo3-video" : "veo3.1-video";
    return {
      model: backend,
      task_type: params.task_type || defaultTask,
      input,
      config,
    };
  }

  // ── KLING TURBO (2.5) ────────────────────────────────────────────────────
  // AUDITORIA 2: model="kling-turbo" falha 100% das vezes com internal 500.
  // A solução correta é usar model="kling" com version="2.5" e mode="turbo".
  // Confirmado funcionando em 2026-07-25.
  if (backend === "kling-turbo") {
    const duration = quality === "low" ? 5 : 10;
    const klingVersion = (params.kling_version || "2.5").replace("-turbo", "");
    const input: Record<string, unknown> = {
      prompt,
      version: klingVersion,  // "2.5" — sem o sufixo "-turbo"
      mode: "turbo",           // mode=turbo é o correto para este modelo
      duration,
      aspect_ratio: aspect,
    };
    if (imageUrl) input.start_image_url = imageUrl;
    if (endImageUrl) input.end_image_url = endImageUrl;
    if (referenceVideos && referenceVideos.length > 0) {
      input.reference_video_url = referenceVideos[0];
    }
    if (negativePrompt) input.negative_prompt = negativePrompt;
    // Usa model="kling" (não "kling-turbo") — confirmado pela PiAPI
    return { model: "kling", task_type: "video_generation", input, config };
  }

  // ── KLING (classic / 3.0 / omni) ─────────────────────────────────────────
  const taskType = params.task_type || "video_generation";
  const version = params.kling_version || "1.6";

  // Kling Omni 3.0 — task_type diferente + resolution + enable_audio
  if (taskType === "omni_video_generation") {
    // omni_video_generation exige version 3.0; nunca usar o fallback genérico "1.6"
    const omniVersion = version === "1.6" ? "3.0" : version;
    // Respeita a resolução do usuário; Kling Omni aceita 720p/1080p → 480p→720p.
    let resolution = args.resolution || (quality === "high" ? "1080p" : "720p");
    if (resolution === "480p") resolution = "720p";
    const input: Record<string, unknown> = {
      prompt,
      version: omniVersion,
      duration: clampInt(userDur, 3, 15),
      resolution,
      aspect_ratio: aspect,
      enable_audio: args.withAudio ?? false,
    };
    // Kling Omni usa images[] com @image_N no prompt.
    // Prioriza referenceImages (aba Omni Reference); senão usa start/end frame.
    const omniImages: string[] =
      referenceImages && referenceImages.length > 0
        ? referenceImages.slice(0, 4)
        : ([imageUrl, endImageUrl].filter(Boolean) as string[]);
    if (omniImages.length > 0) {
      input.images = omniImages;
      // Prepend @image_N refs ao prompt (obrigatório pela PiAPI para Kling Omni)
      const imgRefs = omniImages.map((_, i) => `@image_${i + 1}`).join(" ");
      input.prompt = `${imgRefs} ${prompt}`;
    }
    // Vídeo de referência: campo "video" (singular) + @video no prompt
    if (referenceVideos && referenceVideos.length > 0) {
      input.video = referenceVideos[0];
      const currentPrompt = (input.prompt as string) || prompt;
      if (!currentPrompt.includes("@video")) {
        input.prompt = `@video ${currentPrompt}`;
      }
    }
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
    if (endImageUrl) input.image_tail_url = endImageUrl;
    if (referenceVideos && referenceVideos.length > 0) {
      input.reference_video_url = referenceVideos[0];
    }
    // enable_audio: suportado no Kling 3.0 (não no 3.0-turbo).
    if (version !== "3.0-turbo") {
      input.enable_audio = args.withAudio ?? false;
    }
    // Multi-Shot (storyboard) — campo correto é multi_shots + prefer_multi_shots.
    if (version === "3.0" && args.shots && args.shots.length > 0) {
      // Construir shots candidatos (já limitados a 6)
      let shots = args.shots.slice(0, 6).map((s) => ({
        prompt: s.prompt,
        duration: clampInt(s.duration, 3, 15),
      }));

      // Validar soma ≤ 15s: aparar shots excedentes
      let totalDuration = shots.reduce((acc, s) => acc + s.duration, 0);
      while (totalDuration > 15 && shots.length > 1) {
        shots = shots.slice(0, shots.length - 1);
        totalDuration = shots.reduce((acc, s) => acc + s.duration, 0);
      }

      input.prefer_multi_shots = true;
      input.multi_shots = shots;
    } else {
      input.prefer_multi_shots = false; // 3.0-turbo: nunca multi_shots
    }
    if (negativePrompt) input.negative_prompt = negativePrompt;
    return { model: "kling", task_type: "video_generation", input, config };
  }

  // Kling classic (1.5/1.6/2.1/2.5/2.6) — duração ENUM 5 ou 10
  const mode = quality === "high" ? "pro" : "std";
  const duration = quality === "low" ? 5 : 10;
  const input: Record<string, unknown> = {
    prompt,
    version,
    mode,
    duration,
    aspect_ratio: aspect,
  };
  if (imageUrl) input.image_url = imageUrl;
  if (endImageUrl) input.image_tail_url = endImageUrl;
  if (referenceVideos && referenceVideos.length > 0) {
    input.reference_video_url = referenceVideos[0];
  }
  if (negativePrompt) input.negative_prompt = negativePrompt;
  return { model: "kling", task_type: "video_generation", input, config };
}

/**
 * Submete uma task de vídeo já montada (POST /task) e devolve o task_id.
 */
export async function submitVideoTask(
  payload: Record<string, unknown>,
  requestId = "-"
): Promise<PiAPITaskResponse> {
  const t0 = Date.now();
  auditLog("piapi.submitVideoTask", "entrada", requestId, {
    model: payload.model,
    task_type: payload.task_type,
  });
  try {
    const res = await piapiFetch<PiAPITaskResponse>("/task", {
      method: "POST",
      body: JSON.stringify(payload),
    }, requestId);
    auditLog("piapi.submitVideoTask", "sucesso", requestId, {
      task_id: res?.data?.task_id,
      status: res?.data?.status,
    }, Date.now() - t0);
    return res;
  } catch (err) {
    auditLog("piapi.submitVideoTask", "falha", requestId, {
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    throw err;
  }
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
  taskId: string,
  requestId = "-"
): Promise<PiAPIStatusResponse> {
  const t0 = Date.now();
  auditLog("piapi.getTaskStatus", "entrada", requestId, { task_id: taskId });
  try {
    const res = await piapiFetch<PiAPIStatusResponse>(
      `/task/${taskId}`,
      { method: "GET" },
      requestId
    );
    auditLog("piapi.getTaskStatus", "sucesso", requestId, {
      task_id: taskId,
      status: res?.data?.status,
      has_output: Boolean(res?.data?.output),
      logs: res?.data?.logs || [],
      error: res?.data?.error || null,
    }, Date.now() - t0);
    return res;
  } catch (err) {
    auditLog("piapi.getTaskStatus", "falha", requestId, {
      task_id: taskId,
      error: err instanceof Error ? err.message : String(err),
    }, Date.now() - t0);
    throw err;
  }
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
    (Array.isArray((o as { image_urls?: unknown }).image_urls)
      ? ((o as { image_urls?: string[] }).image_urls?.[0] ?? null)
      : null) ||
    output.videos?.[0]?.url ||
    null
  );
}
