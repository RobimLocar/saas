// Fonte única de capabilities (camada PRODUTO/UI) para Studio Dock + Flow Builder.
//
// UI capability only.
// Provider contract validated separately.
//
// Esta camada responde APENAS "quais controles aparecem para o usuário?".
// Ela NÃO responde "qual payload a PiAPI aceita?" e NÃO depende de React,
// componentes de UI, chamadas de API ou schema PiAPI. `task_type`/`backend`/`kind`
// são usados só para resolver a UI — nunca como verdade de contrato do provider.

/* ────────────────────────────── Tipos ────────────────────────────── */

export type ModelType = "video" | "image" | "audio";

export type DurationSpec =
  | { type: "enum"; values: number[] }
  | { type: "range"; min: number; max: number }
  | null;

/** Entrada mínima (camada produto) — o que a UI já conhece de cada modelo. */
export interface ModelInput {
  model_id: string;
  type: ModelType;
  backend?: string | null;
  task_type?: string | null;
  kind?: string | null; // audio: "music" | "sfx" | "tts"
}

export interface VideoCapabilities {
  kind: "video";
  prompt: boolean;
  negativePrompt: boolean;
  startFrame: boolean;
  endFrame: boolean;
  referenceImages: boolean;
  referenceVideo: boolean;
  audio: boolean;
  dubbingAudio: boolean;
  duration: DurationSpec;
  resolution: string[];
  aspectRatio: string[];
  seed: boolean;
  multiShot: boolean;
  omni: boolean;
  motion: boolean;
  // Flags específicas do Flow Builder (paridade VCaps):
  refAudio: boolean;      // input de áudio de referência (Seedance)
  veoRefs: boolean;       // slot de imagens de referência do Veo 3.1
  rule1080Dur6: boolean;  // trava duração=6 em 1080p (Hailuo)
  wanExtras: boolean;     // shot_type / prompt_extend (Wan)
}

export interface ImageCapabilities {
  kind: "image";
  prompt: boolean;
  negativePrompt: boolean;
  referenceImages: boolean;
  aspectRatio: string[];
  resolution: string[];
  seed: boolean;
  guidance: boolean;
  steps: boolean;
}

export interface AudioCapabilities {
  kind: "audio";
  prompt: boolean;
  lyrics: boolean;
  voice: boolean;
  duration: boolean;
}

export type Capabilities =
  | VideoCapabilities
  | ImageCapabilities
  | AudioCapabilities;

/** Agrupamento dos campos em seções para a UI renderizar. */
export interface ModelUISpec {
  basic: string[];
  references: string[];
  advanced: string[];
}

/** Rótulos opcionais por campo (camada UI). */
export const FIELD_LABELS: Record<string, string> = {
  prompt: "Prompt",
  negativePrompt: "Prompt negativo",
  startFrame: "Frame inicial",
  endFrame: "Frame final",
  referenceImages: "Imagens de referência",
  referenceVideo: "Vídeo de referência",
  audio: "Áudio nativo",
  dubbingAudio: "Áudio da fala",
  duration: "Duração",
  resolution: "Resolução",
  aspectRatio: "Proporção",
  seed: "Seed",
  multiShot: "Multi-shot",
  omni: "Omni Reference",
  motion: "Controle de movimento",
  guidance: "Guidance",
  steps: "Steps",
  lyrics: "Letra",
  voice: "Voz",
};

/* ─────────────────────────── Listas ─────────────────────────── */

const KV_ASPECTS = ["16:9", "9:16", "1:1"];
const VEO_ASPECTS = ["16:9", "9:16"];
const SEEDANCE_ASPECTS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const WAN_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const FLUX_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:2", "3:4"];
const GEMINI_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

const D = {
  enum: (values: number[]): DurationSpec => ({ type: "enum", values }),
  range: (min: number, max: number): DurationSpec => ({ type: "range", min, max }),
};

/* ─────────────────── Builders (defaults + overrides) ─────────────────── */

function v(o: Partial<VideoCapabilities>): VideoCapabilities {
  return {
    kind: "video",
    prompt: true,
    negativePrompt: false,
    startFrame: false,
    endFrame: false,
    referenceImages: false,
    referenceVideo: false,
    audio: false,
    dubbingAudio: false,
    duration: null,
    resolution: [],
    aspectRatio: [],
    seed: false,
    multiShot: false,
    omni: false,
    motion: false,
    refAudio: false,
    veoRefs: false,
    rule1080Dur6: false,
    wanExtras: false,
    ...o,
  };
}

function seedance(o: Partial<VideoCapabilities>): Partial<VideoCapabilities> {
  return {
    startFrame: true,
    endFrame: true,
    referenceImages: true,
    referenceVideo: true,
    refAudio: true,
    omni: true,
    negativePrompt: true,
    aspectRatio: SEEDANCE_ASPECTS,
    ...o,
  };
}

function img(o: Partial<ImageCapabilities>): ImageCapabilities {
  return {
    kind: "image",
    prompt: true,
    negativePrompt: false,
    referenceImages: true,
    aspectRatio: [],
    resolution: ["1K"],
    seed: false,
    guidance: false,
    steps: false,
    ...o,
  };
}

function aud(o: Partial<AudioCapabilities>): AudioCapabilities {
  return {
    kind: "audio",
    prompt: true,
    lyrics: false,
    voice: false,
    duration: false,
    ...o,
  };
}

/* ───────────────── Tabela por model_id (fonte primária) ───────────────── */

// Paridade estrita com o VCaps do Flow Builder. Campos de referência do Flow:
// Kling NÃO expõe referenceVideo (só Seedance via refVideo); Veo 3.1 usa veoRefs
// (não referenceImages); Wan não expõe seed genérico (usa wanExtras).
const VIDEO_CAPS: Record<string, VideoCapabilities> = {
  "kling-2.5-turbo": v({ startFrame: true, endFrame: true, negativePrompt: true, duration: D.enum([5, 10]), resolution: ["720p", "1080p"], aspectRatio: KV_ASPECTS }),
  "kling-3.0": v({ startFrame: true, endFrame: true, audio: true, negativePrompt: true, multiShot: true, duration: D.range(3, 15), resolution: ["720p", "1080p"], aspectRatio: KV_ASPECTS }),
  "kling-omni": v({ startFrame: true, endFrame: true, referenceImages: true, omni: true, negativePrompt: true, duration: D.range(3, 15), resolution: ["720p", "1080p"], aspectRatio: KV_ASPECTS }),
  "kling-3.0-motion": v({ startFrame: true, motion: true, duration: D.range(3, 30), resolution: ["1080p"], aspectRatio: KV_ASPECTS }),
  "kling-avatar": v({ startFrame: true, dubbingAudio: true, duration: D.enum([4, 8]), resolution: ["720p"], aspectRatio: [] }),
  "hailuo": v({ startFrame: true, rule1080Dur6: true, duration: D.enum([6, 10]), resolution: ["720p", "1080p"], aspectRatio: [] }),
  "hailuo-live": v({ startFrame: true, rule1080Dur6: true, duration: D.enum([6, 10]), resolution: ["720p", "1080p"], aspectRatio: [] }),
  "seedance-2.0": v(seedance({ resolution: ["480p", "720p", "1080p"], duration: D.range(4, 15) })),
  "seedance-2.0-less-restriction": v(seedance({ resolution: ["480p", "720p", "1080p"], duration: D.range(4, 15) })),
  "seedance-2.0-fast": v(seedance({ resolution: ["480p", "720p"], duration: D.range(4, 15) })),
  "seedance-1.5-pro": v(seedance({ resolution: ["480p", "720p"], duration: D.range(4, 15) })),
  "seedance-2.5": v(seedance({ resolution: ["480p", "720p", "1080p"], duration: D.range(4, 30) })),
  "veo-3": v({ startFrame: true, audio: true, seed: true, negativePrompt: true, duration: D.enum([4, 6, 8]), resolution: ["720p", "1080p"], aspectRatio: VEO_ASPECTS }),
  "veo-3-fast": v({ startFrame: true, audio: true, seed: true, negativePrompt: true, duration: D.enum([4, 6, 8]), resolution: ["720p", "1080p"], aspectRatio: VEO_ASPECTS }),
  "veo-3.1-fast": v({ startFrame: true, endFrame: true, veoRefs: true, audio: true, seed: true, negativePrompt: true, duration: D.enum([4, 6, 8]), resolution: ["720p", "1080p"], aspectRatio: VEO_ASPECTS }),
  "veo-3.1-quality": v({ startFrame: true, endFrame: true, veoRefs: true, audio: true, seed: true, negativePrompt: true, duration: D.enum([4, 6, 8]), resolution: ["720p", "1080p"], aspectRatio: VEO_ASPECTS }),
  "wan-2.1-video": v({ startFrame: true, audio: true, negativePrompt: true, wanExtras: true, duration: D.enum([5, 10, 15]), resolution: ["720p", "1080p"], aspectRatio: WAN_ASPECTS }),
};

const IMAGE_CAPS: Record<string, ImageCapabilities> = {
  "Qubico/flux1-dev": img({ negativePrompt: true, seed: true, guidance: true, aspectRatio: FLUX_ASPECTS, resolution: ["1K"] }),
  "Qubico/flux1-schnell": img({ negativePrompt: true, seed: true, guidance: true, aspectRatio: FLUX_ASPECTS, resolution: ["1K"] }),
  "gpt-image-2": img({ aspectRatio: ["1:1", "16:9", "9:16"], resolution: ["1K"] }),
  "nano-banana": img({ aspectRatio: GEMINI_ASPECTS, resolution: ["1K"] }),
  "nano-banana-pro": img({ aspectRatio: GEMINI_ASPECTS, resolution: ["1K", "2K", "4K"] }),
  "qwen-image": img({ negativePrompt: true, seed: true, steps: true, aspectRatio: GEMINI_ASPECTS, resolution: ["1K"] }),
};

const AUDIO_CAPS: Record<string, AudioCapabilities> = {
  "udio-music": aud({ lyrics: true }),
  "Qubico/ace-step": aud({ lyrics: true }),
  "mmaudio": aud({}),
  "elevenlabs-sfx": aud({}),
  "elevenlabs-flash": aud({ voice: true }),
  "elevenlabs-multilingual-v2": aud({ voice: true }),
  "elevenlabs-turbo-v2.5": aud({ voice: true }),
};

/** Lista de model_ids ativos conhecidos (para testes/inventário). */
export const KNOWN_MODEL_IDS: Record<ModelType, string[]> = {
  video: Object.keys(VIDEO_CAPS),
  image: Object.keys(IMAGE_CAPS),
  audio: Object.keys(AUDIO_CAPS),
};

/* ─────────── Derivação por família (fallback p/ id desconhecido) ─────────── */
// UI capability only. Provider contract validated separately.

function deriveVideo(m: ModelInput): VideoCapabilities {
  const backend = (m.backend || "").toLowerCase();
  const tt = (m.task_type || "").toLowerCase();
  if (tt === "avatar") return v({ startFrame: true, dubbingAudio: true, duration: D.enum([4, 8]), resolution: ["720p"] });
  if (tt === "motion_control") return v({ startFrame: true, referenceVideo: true, motion: true, duration: D.range(3, 30), resolution: ["1080p"], aspectRatio: KV_ASPECTS });
  if (tt === "omni_video_generation") return v({ startFrame: true, endFrame: true, referenceImages: true, omni: true, negativePrompt: true, duration: D.range(3, 15), resolution: ["720p", "1080p"], aspectRatio: KV_ASPECTS });
  if (backend === "seedance") return v(seedance({ resolution: ["480p", "720p", "1080p"], duration: D.range(4, 15) }));
  if (backend === "veo3" || backend === "veo3.1") return v({ startFrame: true, endFrame: backend === "veo3.1", veoRefs: backend === "veo3.1", audio: true, seed: true, negativePrompt: true, duration: D.enum([4, 6, 8]), resolution: ["720p", "1080p"], aspectRatio: VEO_ASPECTS });
  if (backend === "wan") return v({ startFrame: true, audio: true, negativePrompt: true, wanExtras: true, duration: D.enum([5, 10, 15]), resolution: ["720p", "1080p"], aspectRatio: WAN_ASPECTS });
  if (backend === "hailuo") return v({ startFrame: true, rule1080Dur6: true, duration: D.enum([6, 10]), resolution: ["720p", "1080p"] });
  return v({ startFrame: true, endFrame: true, negativePrompt: true, duration: D.range(3, 15), resolution: ["720p", "1080p"], aspectRatio: KV_ASPECTS });
}

function deriveImage(): ImageCapabilities {
  return img({ negativePrompt: true, seed: true, aspectRatio: FLUX_ASPECTS, resolution: ["1K"] });
}

function deriveAudio(m: ModelInput): AudioCapabilities {
  const kind = (m.kind || "").toLowerCase();
  if (kind === "tts") return aud({ voice: true });
  if (kind === "music") return aud({ lyrics: true });
  return aud({});
}

/* ───────────────────────────── API pública ───────────────────────────── */

/**
 * Resolve as capabilities de UI de um modelo.
 * UI capability only. Provider contract validated separately.
 */
export function resolveCapabilities(model: ModelInput): Capabilities {
  if (model.type === "video") return VIDEO_CAPS[model.model_id] ?? deriveVideo(model);
  if (model.type === "image") return IMAGE_CAPS[model.model_id] ?? deriveImage();
  return AUDIO_CAPS[model.model_id] ?? deriveAudio(model);
}

const VIDEO_ORDER = {
  basic: ["prompt", "duration", "resolution", "aspectRatio", "audio"],
  references: ["startFrame", "endFrame", "referenceImages", "referenceVideo", "dubbingAudio", "omni", "motion"],
  advanced: ["negativePrompt", "seed", "multiShot"],
};
const IMAGE_ORDER = {
  basic: ["prompt", "aspectRatio", "resolution"],
  references: ["referenceImages"],
  advanced: ["negativePrompt", "seed", "guidance", "steps"],
};
const AUDIO_ORDER = {
  basic: ["prompt", "voice", "lyrics"],
  references: [] as string[],
  advanced: ["duration"],
};

/** true se o campo deve aparecer: bool true, lista não-vazia ou DurationSpec presente. */
function fieldActive(caps: Record<string, unknown>, field: string): boolean {
  const val = caps[field];
  if (Array.isArray(val)) return val.length > 0;
  if (val && typeof val === "object") return true; // DurationSpec
  return val === true;
}

/** Ordena/filtra os campos ativos em basic/references/advanced. */
export function resolveUISpec(model: ModelInput): ModelUISpec {
  const caps = resolveCapabilities(model) as unknown as Record<string, unknown>;
  const order =
    model.type === "video" ? VIDEO_ORDER : model.type === "image" ? IMAGE_ORDER : AUDIO_ORDER;
  const pick = (fields: string[]) => fields.filter((f) => fieldActive(caps, f));
  return {
    basic: pick(order.basic),
    references: pick(order.references),
    advanced: pick(order.advanced),
  };
}
