// P5c — Audio UI Spec Foundation (camada PRODUTO/UI).
//
// Fonte ÚNICA e semântica de "como é a UI de Audio por comportamento de modelo".
// Representa modos, campos condicionais, inputs obrigatórios, basic/advanced,
// limites OFICIALMENTE confirmados e product defaults. NÃO contém billing,
// credit_cost, API keys, provider task_type como regra de UI, nem mapping
// provider-specific (isso vive no backend/catálogo).
//
// SEM wiring: nenhum componente/route consome isto ainda (P5c é só a fundação).
// A tradução provider-specific (gpt_description_prompt, lyrics_type, language_code,
// "[inst]", etc.) continua no backend — a UI usa apenas os field/mode IDs abaixo.

import { TTS_MAX_CHARACTERS } from "@/lib/billing/tts-pricing";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type AudioProfileId =
  | "elevenlabs-v3-tts"
  | "udio"
  | "ace-step-music"
  | "ace-step-sfx"
  | "kling-sfx"
  | "mmaudio-video2audio"
  | "generic";

/** IDs semânticos de campo (nunca nomes provider-specific na UI). */
export type AudioFieldId =
  | "prompt"
  | "text"
  | "voice"
  | "stability"
  | "language"
  | "lyrics"
  | "duration"
  | "negativePrompt"
  | "negativeTags"
  | "seed"
  | "video";

export type AudioFieldPlacement = "basic" | "advanced";

/** Restrições numéricas — apenas quando OFICIALMENTE confirmadas. */
export interface AudioNumberConstraints {
  min?: number;
  max?: number;
  step?: number;
}

/** Campo visível somente quando o modo atual ∈ modes. */
export interface AudioFieldCondition {
  modes: string[];
}

export interface AudioUIField {
  id: AudioFieldId;
  placement: AudioFieldPlacement;
  /** input obrigatório para gerar (ex.: text do TTS, video do MMAudio). */
  required?: boolean;
  /** chave de i18n (o repo usa next-intl) — nunca string inglesa hardcoded. */
  labelKey: string;
  /** limite de caracteres (ex.: TTS text = 5000). Só se confirmado. */
  maxLength?: number;
  /** restrições numéricas (ex.: stability 0–1). undefined = suportado sem range confirmado. */
  number?: AudioNumberConstraints;
  /** campo condicional por modo. */
  visibleWhen?: AudioFieldCondition;
  /** default de PRODUTO explícito (≠ default do provider). */
  productDefault?: number | string;
}

export interface AudioUIMode {
  id: string;
  labelKey: string;
}

/** Requisito de input não-textual (ex.: vídeo). Espelha um field required. */
export interface AudioInputRequirement {
  id: AudioFieldId;
}

export interface AudioUISpec {
  profile: AudioProfileId;
  labelKey: string;
  /** ausente = sem seletor de modo. */
  modes?: AudioUIMode[];
  fields: AudioUIField[];
  requiredInputs: AudioInputRequirement[];
  /** perfil de referência/futuro; NÃO mapeado a um modelo ativo do catálogo. */
  future?: boolean;
}

export interface AudioModelInput {
  modelId?: string | null;
  kind?: string | null;
  backend?: string | null;
}

/* ─────────────────────────── Perfis ─────────────────────────── */

// TTS — Atlas ElevenLabs v3. Contrato oficial: text (≤5000), voice, stability
// (0–1), language_code, apply_text_normalization. SEM similarity/speed.
// UI V1: text + voice + stability (basic); language (advanced). normalization
// permanece "auto" no backend, não é exposto.
const TTS_SPEC: AudioUISpec = {
  profile: "elevenlabs-v3-tts",
  labelKey: "audio.profile.tts",
  fields: [
    { id: "text", placement: "basic", required: true, labelKey: "audio.field.text", maxLength: TTS_MAX_CHARACTERS },
    { id: "voice", placement: "basic", required: true, labelKey: "audio.field.voice" },
    { id: "stability", placement: "basic", labelKey: "audio.field.stability", number: { min: 0, max: 1, step: 0.01 }, productDefault: 0.3 },
    { id: "language", placement: "advanced", labelKey: "audio.field.language" },
  ],
  requiredInputs: [],
};

// Udio — PiAPI music-u. 3 modos oficiais (lyrics_type generate/instrumental/user),
// representados semanticamente. lyrics só no modo custom. negativeTags/seed advanced.
const UDIO_SPEC: AudioUISpec = {
  profile: "udio",
  labelKey: "audio.profile.udio",
  modes: [
    { id: "ai-vocals", labelKey: "audio.mode.aiVocals" },
    { id: "instrumental", labelKey: "audio.mode.instrumental" },
    { id: "custom-lyrics", labelKey: "audio.mode.customLyrics" },
  ],
  fields: [
    { id: "prompt", placement: "basic", required: true, labelKey: "audio.field.musicPrompt" },
    { id: "lyrics", placement: "basic", required: true, labelKey: "audio.field.lyrics", visibleWhen: { modes: ["custom-lyrics"] } },
    { id: "negativeTags", placement: "advanced", labelKey: "audio.field.negativeTags" },
    { id: "seed", placement: "advanced", labelKey: "audio.field.seed" },
  ],
  requiredInputs: [],
};

// ACE-Step (música) — PiAPI Qubico/ace-step txt2audio. style_prompt, lyrics
// (instrumental oficial = "[inst]", traduzido no backend), duration, negative_prompt.
// 2 modos (instrumental|lyrics) — NÃO reutiliza os 3 modos do Udio.
// duration SUPORTADO, mas min/max/step NÃO confirmados nas docs → sem range inventado.
// infer_step NÃO é exposto (fora das docs).
const ACE_STEP_MUSIC_SPEC: AudioUISpec = {
  profile: "ace-step-music",
  labelKey: "audio.profile.aceStepMusic",
  modes: [
    { id: "instrumental", labelKey: "audio.mode.instrumental" },
    { id: "lyrics", labelKey: "audio.mode.lyrics" },
  ],
  fields: [
    { id: "prompt", placement: "basic", required: true, labelKey: "audio.field.stylePrompt" },
    { id: "lyrics", placement: "basic", required: true, labelKey: "audio.field.lyrics", visibleWhen: { modes: ["lyrics"] } },
    // duration: suportado; constraints undefined (DURATION RANGE UNVERIFIED — não inventar).
    { id: "duration", placement: "basic", labelKey: "audio.field.duration" },
    { id: "negativePrompt", placement: "advanced", labelKey: "audio.field.negativePrompt" },
  ],
  requiredInputs: [],
};

// ACE-Step SFX — decisão P5a: manter ACE-Step como SFX temporariamente, honesto e
// mínimo. NÃO expõe lyrics (não faz sentido em SFX) só porque o backend suporta.
const ACE_STEP_SFX_SPEC: AudioUISpec = {
  profile: "ace-step-sfx",
  labelKey: "audio.profile.aceStepSfx",
  fields: [
    { id: "prompt", placement: "basic", required: true, labelKey: "audio.field.sfxPrompt" },
  ],
  requiredInputs: [],
};

// Kling Sound SFX (P5g) — PiAPI model=kling, task_type=sound (text-to-audio).
// Contrato oficial: input.prompt + input.duration (5|10). 4 saídas MP3. SEM
// lyrics/negative/seed/voice/stability/video/cover. duration é BASIC (required,
// enum 5|10 — os valores são tratados na UI/route, não como range numérico aqui).
// CÓDIGO DORMENTE: nenhum SKU Kling ativo existe no catálogo ainda (P5g2).
const KLING_SFX_SPEC: AudioUISpec = {
  profile: "kling-sfx",
  labelKey: "audio.profile.klingSfx",
  fields: [
    { id: "prompt", placement: "basic", required: true, labelKey: "audio.field.sfxPrompt" },
    { id: "duration", placement: "basic", required: true, labelKey: "audio.field.duration" },
  ],
  requiredInputs: [],
};

// MMAudio REAL (futuro) — PiAPI Qubico/mmaudio video2audio. Prova que a arquitetura
// suporta um input OBRIGATÓRIO de vídeo (não é "Audio = prompt-only"). Marcado como
// future e NÃO ligado ao alias atual `mmaudio` (que roteia para ACE-Step).
// P5h/P5h-fix — MMAudio REAL (video2audio), resolvido por backend (Qubico/mmaudio).
// Profile PROMOVIDO: após o full-stack P5h já NÃO é "future" — flag removida e id
// renomeado para "mmaudio-video2audio" (verdade semântica; identidade candidata do
// SKU real). Continua DORMENTE porque nenhum SKU ativo tem backend Qubico/mmaudio
// (o alias falso `mmaudio` roteia para Qubico/ace-step → ace-step-sfx). Campos:
// video+prompt (basic, required) e negativePrompt (advanced). steps/seed NÃO
// expostos (constraints DOC INCOMPLETE). O símbolo exportado MMAUDIO_FUTURE_SPEC é
// mantido para evitar churn de imports (nome interno; o profile é o contrato).
export const MMAUDIO_FUTURE_SPEC: AudioUISpec = {
  profile: "mmaudio-video2audio",
  labelKey: "audio.profile.mmaudio",
  fields: [
    { id: "video", placement: "basic", required: true, labelKey: "audio.field.video" },
    { id: "prompt", placement: "basic", required: true, labelKey: "audio.field.prompt" },
    { id: "negativePrompt", placement: "advanced", labelKey: "audio.field.negativePrompt" },
  ],
  requiredInputs: [{ id: "video" }],
};

// Fallback explícito e seguro para modelo Audio desconhecido: prompt-only.
// Não é permissivo (não inventa voice/lyrics/duration) e não mascara erro — é o
// comportamento mínimo consciente.
const GENERIC_SPEC: AudioUISpec = {
  profile: "generic",
  labelKey: "audio.profile.generic",
  fields: [
    { id: "prompt", placement: "basic", required: true, labelKey: "audio.field.prompt" },
  ],
  requiredInputs: [],
};

/** Perfis semânticos por comportamento (NÃO por model_id). */
export const AUDIO_UI_PROFILES: Record<AudioProfileId, AudioUISpec> = {
  "elevenlabs-v3-tts": TTS_SPEC,
  "udio": UDIO_SPEC,
  "ace-step-music": ACE_STEP_MUSIC_SPEC,
  "ace-step-sfx": ACE_STEP_SFX_SPEC,
  "kling-sfx": KLING_SFX_SPEC,
  "mmaudio-video2audio": MMAUDIO_FUTURE_SPEC,
  "generic": GENERIC_SPEC,
};

/* ─────────────────────────── Resolver ─────────────────────────── */

/**
 * Resolve o comportamento de UI a partir do que o catálogo já conhece do modelo.
 * Vários model_ids/aliases que representam o MESMO comportamento resolvem para o
 * MESMO objeto de spec (sem cópias divergentes).
 *
 * NÃO trata o alias atual `mmaudio` (backend Qubico/ace-step) como MMAudio real —
 * ele cai em ace-step-sfx. O perfil MMAudio real só é acessível via MMAUDIO_FUTURE_SPEC.
 */
export function resolveAudioUISpec(model: AudioModelInput): AudioUISpec {
  const kind = (model.kind ?? "").toLowerCase();
  const backend = (model.backend ?? "").toLowerCase();
  const id = (model.modelId ?? "").toLowerCase();

  if (backend === "atlas-tts" || kind === "tts") return TTS_SPEC;
  if (backend === "music-u" || id === "udio-music") return UDIO_SPEC;
  // Kling Sound SFX (P5g) — AVALIADO ANTES da regra genérica de SFX. Distingue o
  // futuro Kling (kind sfx + backend/model kling) dos aliases ACE-Step (kind sfx
  // + backend Qubico/ace-step). Dormente até o SKU real existir (P5g2).
  if (kind === "sfx" && (backend === "kling" || id === "kling")) return KLING_SFX_SPEC;
  // MMAudio REAL (P5h) — video2audio. Chaveado pelo BACKEND real (verdade
  // provider-side), NÃO por kind. O alias FALSO `mmaudio` (backend Qubico/ace-step,
  // id "mmaudio") NÃO casa aqui → continua ace-step-sfx. Só o SKU verdadeiro
  // (backend Qubico/mmaudio ou id mmaudio-video2audio) resolve para o profile MMAudio.
  if (backend === "qubico/mmaudio" || id === "mmaudio-video2audio") return MMAUDIO_FUTURE_SPEC;
  if (backend === "qubico/ace-step" || id === "qubico/ace-step" || id.includes("ace-step")) {
    return kind === "sfx" ? ACE_STEP_SFX_SPEC : ACE_STEP_MUSIC_SPEC;
  }
  // aliases atuais de SFX que rodam ACE-Step, mas cujo model_id não contém "ace-step":
  if (kind === "sfx") return ACE_STEP_SFX_SPEC;
  return GENERIC_SPEC;
}

/** IDs de modelo Audio ativos conhecidos (para inventário/testes). */
export const KNOWN_AUDIO_MODEL_IDS: string[] = [
  "elevenlabs-flash",
  "elevenlabs-turbo-v2.5",
  "elevenlabs-multilingual-v2",
  "elevenlabs-sfx",
  "Qubico/ace-step",
  "udio-music",
  "mmaudio",
];

/* ───────────────── Compat: projeção para o sistema legado ───────────────── */

/** Projeção mínima (booleans) para a camada legada `AudioCapabilities`. */
export interface LegacyAudioCapsProjection {
  prompt: boolean;
  voice: boolean;
  lyrics: boolean;
  duration: boolean;
}

/**
 * Deriva os booleans legados a partir da spec rica — MANTÉM UMA fonte de verdade:
 * `capabilities.ts` (parte Audio) delega para cá em vez de manter um mapa próprio.
 */
export function audioUISpecToLegacyCaps(spec: AudioUISpec): LegacyAudioCapsProjection {
  const has = (fid: AudioFieldId): boolean => spec.fields.some((f) => f.id === fid);
  return {
    prompt: has("prompt") || has("text"),
    voice: has("voice"),
    lyrics: has("lyrics"),
    duration: has("duration"),
  };
}
