// P11a — CONTRACT PROFILES do Atlas.
//
// O TRANSPORTE Atlas é genérico (client.ts), mas o INPUT CONTRACT por modelo NÃO.
// Um profile é o menor mecanismo prático para: escolher endpoint, definir os campos
// que o USUÁRIO pode controlar, exigir os obrigatórios, aplicar defaults/validação,
// declarar o TIPO de saída (mídia|texto) e quais SHAPES de billing são compatíveis.
//
// SEGURANÇA: só os campos declarados em `allowed` chegam ao provider. Nada de
// pass-through de JSON arbitrário do browser. `atlas_model`, endpoint e profile
// vêm SEMPRE da configuração do catálogo (servidor), nunca do cliente.
//
// NÃO contém: preço em dólar do provider, multiplicador de plano, pricing de
// negócio. Billing continua no nível catálogo/produto (Fluxyra shapes).

import type { AtlasEndpoint } from "./client";

export type AtlasContractId =
  | "image-basic"
  | "image-size"
  | "image-edit"
  | "video-basic"
  | "video-image"
  | "video-start-end"
  | "video-reference-images"
  | "video-reference-mixed"
  | "audio-file"
  | "audio-text";

export type AtlasOutputKind = "media" | "text";

// Shapes de billing já existentes no Fluxyra (nenhum novo é criado aqui).
export type BillingShape = "flat" | "credit_per_second" | "credit_cost_map" | "per_kchar";

export type BuildBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

export interface AtlasContractProfile {
  id: AtlasContractId;
  endpoint: AtlasEndpoint;
  outputKind: AtlasOutputKind;
  /** Campos que o usuário PODE fornecer (qualquer outro é ignorado/rejeitado). */
  allowed: string[];
  /** Campos obrigatórios (além de `model`, sempre server-controlled). */
  required: string[];
  /** Shapes de billing compatíveis (declaração; billing real fica no catálogo). */
  billingShapes: BillingShape[];
  /** Monta o body final enviado ao provider a partir do model + input validado. */
  buildBody(atlasModel: string, input: Record<string, unknown>): BuildBodyResult;
}

// ── Validadores pequenos ──────────────────────────────────────────────────────
const isNonEmptyStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
const AR = ["1:1", "9:16", "16:9", "3:4", "4:3", "2:3", "3:2"];
// ROUTE-CERTIFICATION-01 — vídeo suporta 21:9 (H3/Grok/etc.) + "adaptive" (H3 i2v).
const VIDEO_AR = [...AR, "21:9", "adaptive"];
const SIZES = ["1024x1024", "1536x1024", "1024x1536", "512x512", "768x1024", "1024x768"];

/** Copia SÓ os campos permitidos que estão presentes (allowlist estrita). */
function pickAllowed(input: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of allowed) if (input[k] !== undefined && input[k] !== null) out[k] = input[k];
  return out;
}

// ROUTE-CERTIFICATION-01 — campos AVANÇADOS opcionais comuns aos vídeos (seed,
// generate_audio, camera_fixed, prompt_expansion, voice_ids, negative_prompt,
// cfg_scale). São ALLOWLISTED aqui e VALIDADOS por tipo; a ROTA só os inclui no
// input quando a metadata do modelo declara suporte (supported_params_by_mode) —
// evitando "unsupported property exposed". Cada valor inválido é rejeitado (400).
export const VIDEO_ADVANCED_FIELDS = [
  "seed", "generate_audio", "camera_fixed", "prompt_expansion", "voice_ids",
  "negative_prompt", "cfg_scale", "thinking_level",
] as const;

// Campos Kling 4K/O3 PRÉ-VALIDADOS na rota (buildKlingAdvanced): passam pela allowlist
// e são copiados como-estão (a rota é a autoridade de validação de shape/limites).
export const KLING_PASSTHROUGH_FIELDS = ["sound", "multi_shot", "shot_type", "multi_prompt", "elements"] as const;

/** Enum oficial do thinking_level (Gemini Omni Flash Standard). String, NÃO inteiro. */
export const THINKING_LEVELS = ["default", "low", "high"] as const;

function applyPassthrough(body: Record<string, unknown>, picked: Record<string, unknown>): void {
  for (const k of KLING_PASSTHROUGH_FIELDS) if (picked[k] !== undefined && picked[k] !== null) body[k] = picked[k];
}

function applyVideoAdvanced(
  body: Record<string, unknown>,
  picked: Record<string, unknown>
): { ok: true } | { ok: false; error: string } {
  if (picked.seed !== undefined) {
    if (typeof picked.seed !== "number" || !Number.isInteger(picked.seed)) return { ok: false, error: "seed deve ser inteiro" };
    body.seed = picked.seed;
  }
  if (picked.generate_audio !== undefined) {
    if (typeof picked.generate_audio !== "boolean") return { ok: false, error: "generate_audio deve ser boolean" };
    body.generate_audio = picked.generate_audio;
  }
  if (picked.camera_fixed !== undefined) {
    if (typeof picked.camera_fixed !== "boolean") return { ok: false, error: "camera_fixed deve ser boolean" };
    body.camera_fixed = picked.camera_fixed;
  }
  if (picked.prompt_expansion !== undefined) {
    if (typeof picked.prompt_expansion !== "boolean") return { ok: false, error: "prompt_expansion deve ser boolean" };
    body.prompt_expansion = picked.prompt_expansion;
  }
  if (picked.voice_ids !== undefined) {
    const v = picked.voice_ids;
    if (!Array.isArray(v) || v.length > 3 || !v.every((x) => typeof x === "string" && x.length > 0))
      return { ok: false, error: "voice_ids deve ser array de até 3 strings" };
    if (v.length > 0) body.voice_ids = v;
  }
  if (picked.negative_prompt !== undefined) {
    if (typeof picked.negative_prompt !== "string") return { ok: false, error: "negative_prompt inválido" };
    if (picked.negative_prompt.trim()) body.negative_prompt = picked.negative_prompt;
  }
  if (picked.cfg_scale !== undefined) {
    if (typeof picked.cfg_scale !== "number") return { ok: false, error: "cfg_scale deve ser número" };
    body.cfg_scale = picked.cfg_scale;
  }
  // Gemini Omni Flash — thinking_level é STRING ENUM: "default" | "low" | "high" (NÃO inteiro).
  // GEMINI-STANDARD-CONTRACT-FIX-01 §2. Qualquer outro valor → erro (400 pré-débito na rota).
  if (picked.thinking_level !== undefined) {
    if (!(THINKING_LEVELS as readonly string[]).includes(picked.thinking_level as string))
      return { ok: false, error: 'thinking_level deve ser "default", "low" ou "high"' };
    body.thinking_level = picked.thinking_level;
  }
  return { ok: true };
}

export const ATLAS_CONTRACTS: Record<AtlasContractId, AtlasContractProfile> = {
  // Texto→imagem simples: prompt + aspect_ratio opcional.
  "image-basic": {
    id: "image-basic",
    endpoint: "generateImage",
    outputKind: "media",
    allowed: ["prompt", "aspect_ratio", "seed", "output_format"],
    required: ["prompt"],
    billingShapes: ["flat", "credit_cost_map"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      if (!isNonEmptyStr(picked.prompt)) return { ok: false, error: "prompt inválido" };
      if (picked.aspect_ratio !== undefined && !AR.includes(String(picked.aspect_ratio)))
        return { ok: false, error: "aspect_ratio inválido" };
      if (picked.seed !== undefined && typeof picked.seed !== "number")
        return { ok: false, error: "seed deve ser número" };
      const body: Record<string, unknown> = { model: atlasModel, prompt: picked.prompt };
      if (picked.aspect_ratio) body.aspect_ratio = picked.aspect_ratio;
      if (typeof picked.seed === "number") body.seed = picked.seed;
      if (isNonEmptyStr(picked.output_format)) body.output_format = picked.output_format;
      return { ok: true, body };
    },
  },

  // Contrato DIFERENTE (prova que não é hardcode txt2img): usa `size` em vez de AR.
  "image-size": {
    id: "image-size",
    endpoint: "generateImage",
    outputKind: "media",
    allowed: ["prompt", "size", "seed"],
    required: ["prompt", "size"],
    billingShapes: ["flat", "credit_cost_map"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      if (!isNonEmptyStr(picked.prompt)) return { ok: false, error: "prompt inválido" };
      if (!isNonEmptyStr(picked.size) || !SIZES.includes(String(picked.size)))
        return { ok: false, error: "size inválido" };
      const body: Record<string, unknown> = {
        model: atlasModel,
        prompt: picked.prompt,
        size: picked.size,
      };
      if (typeof picked.seed === "number") body.seed = picked.seed;
      return { ok: true, body };
    },
  },

  // Imagem→imagem / edição / tool (upscale, edit): exige image_urls.
  "image-edit": {
    id: "image-edit",
    endpoint: "generateImage",
    outputKind: "media",
    allowed: ["prompt", "image_urls"],
    required: ["image_urls"],
    billingShapes: ["flat", "credit_cost_map"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      const urls = Array.isArray(picked.image_urls)
        ? (picked.image_urls as unknown[]).filter(isHttp)
        : [];
      if (urls.length === 0) return { ok: false, error: "image_urls obrigatório (URLs http)" };
      const body: Record<string, unknown> = { model: atlasModel, image_urls: urls };
      if (isNonEmptyStr(picked.prompt)) body.prompt = picked.prompt;
      return { ok: true, body };
    },
  },

  // Texto→vídeo: prompt + duração/resolução/AR opcionais.
  "video-basic": {
    id: "video-basic",
    endpoint: "generateVideo",
    outputKind: "media",
    allowed: ["prompt", "aspect_ratio", "duration", "resolution", ...VIDEO_ADVANCED_FIELDS, ...KLING_PASSTHROUGH_FIELDS],
    required: ["prompt"],
    billingShapes: ["credit_per_second", "credit_cost_map", "flat"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      if (!isNonEmptyStr(picked.prompt)) return { ok: false, error: "prompt inválido" };
      if (picked.duration !== undefined && (typeof picked.duration !== "number" || picked.duration <= 0))
        return { ok: false, error: "duration inválida" };
      if (picked.aspect_ratio !== undefined && !VIDEO_AR.includes(String(picked.aspect_ratio)))
        return { ok: false, error: "aspect_ratio inválido" };
      const body: Record<string, unknown> = { model: atlasModel, prompt: picked.prompt };
      if (picked.aspect_ratio) body.aspect_ratio = picked.aspect_ratio;
      if (typeof picked.duration === "number") body.duration = picked.duration;
      if (isNonEmptyStr(picked.resolution)) body.resolution = picked.resolution;
      const adv = applyVideoAdvanced(body, picked);
      if (!adv.ok) return adv;
      applyPassthrough(body, picked);
      return { ok: true, body };
    },
  },

  // Imagem→vídeo: exige image_url de origem.
  "video-image": {
    id: "video-image",
    endpoint: "generateVideo",
    outputKind: "media",
    allowed: ["prompt", "image_url", "end_image_url", "duration", "resolution", ...VIDEO_ADVANCED_FIELDS, ...KLING_PASSTHROUGH_FIELDS],
    required: ["image_url"],
    billingShapes: ["credit_per_second", "credit_cost_map", "flat"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      if (!isHttp(picked.image_url)) return { ok: false, error: "image_url inválida (http)" };
      const body: Record<string, unknown> = { model: atlasModel, image_url: picked.image_url };
      // last_image/end_image opcional (i2v que suporta último frame — ex.: Seedance/H3).
      if (isHttp(picked.end_image_url)) body.end_image_url = picked.end_image_url;
      if (isNonEmptyStr(picked.prompt)) body.prompt = picked.prompt;
      if (typeof picked.duration === "number") body.duration = picked.duration;
      if (isNonEmptyStr(picked.resolution)) body.resolution = picked.resolution;
      const adv = applyVideoAdvanced(body, picked);
      if (!adv.ok) return adv;
      applyPassthrough(body, picked);
      return { ok: true, body };
    },
  },

  // Start/End frame → vídeo: exige image_url (start); end_image_url opcional.
  "video-start-end": {
    id: "video-start-end",
    endpoint: "generateVideo",
    outputKind: "media",
    allowed: ["prompt", "image_url", "end_image_url", "duration", "resolution", ...VIDEO_ADVANCED_FIELDS],
    required: ["image_url"],
    billingShapes: ["credit_per_second", "credit_cost_map", "flat"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      if (!isHttp(picked.image_url)) return { ok: false, error: "image_url (start) inválida (http)" };
      const body: Record<string, unknown> = { model: atlasModel, image_url: picked.image_url };
      if (isHttp(picked.end_image_url)) body.end_image_url = picked.end_image_url;
      if (isNonEmptyStr(picked.prompt)) body.prompt = picked.prompt;
      if (typeof picked.duration === "number") body.duration = picked.duration;
      if (isNonEmptyStr(picked.resolution)) body.resolution = picked.resolution;
      const adv = applyVideoAdvanced(body, picked);
      if (!adv.ok) return adv;
      return { ok: true, body };
    },
  },

  // Reference-to-video: refers[] (1–N URLs http). NÃO mapear refs para image_url.
  "video-reference-images": {
    id: "video-reference-images",
    endpoint: "generateVideo",
    outputKind: "media",
    allowed: ["prompt", "refers", "duration", "resolution", ...VIDEO_ADVANCED_FIELDS],
    required: ["refers"],
    billingShapes: ["credit_per_second", "credit_cost_map", "flat"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      const refers = Array.isArray(picked.refers)
        ? (picked.refers as unknown[]).filter(isHttp)
        : [];
      if (refers.length === 0) return { ok: false, error: "refers[] obrigatório (URLs http)" };
      const body: Record<string, unknown> = { model: atlasModel, refers };
      if (isNonEmptyStr(picked.prompt)) body.prompt = picked.prompt;
      if (typeof picked.duration === "number") body.duration = picked.duration;
      if (isNonEmptyStr(picked.resolution)) body.resolution = picked.resolution;
      const adv = applyVideoAdvanced(body, picked);
      if (!adv.ok) return adv;
      return { ok: true, body };
    },
  },

  // Reference MIXTA: image_url + refers[] (ao menos um dos dois).
  "video-reference-mixed": {
    id: "video-reference-mixed",
    endpoint: "generateVideo",
    outputKind: "media",
    allowed: ["prompt", "image_url", "refers", "duration", "resolution", ...VIDEO_ADVANCED_FIELDS],
    required: [],
    billingShapes: ["credit_per_second", "credit_cost_map", "flat"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      const refers = Array.isArray(picked.refers)
        ? (picked.refers as unknown[]).filter(isHttp)
        : [];
      const hasImg = isHttp(picked.image_url);
      if (!hasImg && refers.length === 0)
        return { ok: false, error: "image_url ou refers[] obrigatório" };
      const body: Record<string, unknown> = { model: atlasModel };
      if (hasImg) body.image_url = picked.image_url;
      if (refers.length > 0) body.refers = refers;
      if (isNonEmptyStr(picked.prompt)) body.prompt = picked.prompt;
      if (typeof picked.duration === "number") body.duration = picked.duration;
      if (isNonEmptyStr(picked.resolution)) body.resolution = picked.resolution;
      const adv = applyVideoAdvanced(body, picked);
      if (!adv.ok) return adv;
      return { ok: true, body };
    },
  },

  // Áudio com saída de MÍDIA (TTS/música): retorna URL de arquivo.
  "audio-file": {
    id: "audio-file",
    endpoint: "generateAudio",
    outputKind: "media",
    allowed: ["prompt", "text", "voice", "stability"],
    required: [],
    billingShapes: ["per_kchar", "flat"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      const body: Record<string, unknown> = { model: atlasModel };
      if (isNonEmptyStr(picked.text)) body.text = picked.text;
      if (isNonEmptyStr(picked.prompt)) body.prompt = picked.prompt;
      if (isNonEmptyStr(picked.voice)) body.voice = picked.voice;
      if (typeof picked.stability === "number") body.stability = picked.stability;
      if (!body.text && !body.prompt) return { ok: false, error: "text ou prompt obrigatório" };
      return { ok: true, body };
    },
  },

  // Áudio com saída de TEXTO (ASR/lyrics): retorna texto, não mídia.
  "audio-text": {
    id: "audio-text",
    endpoint: "generateAudio",
    outputKind: "text",
    allowed: ["audio_url", "language"],
    required: ["audio_url"],
    billingShapes: ["flat", "per_kchar"],
    buildBody(atlasModel, input) {
      const picked = pickAllowed(input, this.allowed);
      if (!isHttp(picked.audio_url)) return { ok: false, error: "audio_url inválida (http)" };
      const body: Record<string, unknown> = { model: atlasModel, audio_url: picked.audio_url };
      if (isNonEmptyStr(picked.language)) body.language = picked.language;
      return { ok: true, body };
    },
  },
};

export function getAtlasContract(id: string | undefined | null): AtlasContractProfile | null {
  if (!id) return null;
  return (ATLAS_CONTRACTS as Record<string, AtlasContractProfile>)[id] ?? null;
}

export function billingShapeCompatible(id: string | undefined | null, shape: BillingShape): boolean {
  const p = getAtlasContract(id);
  return !!p && p.billingShapes.includes(shape);
}
