// FLUXYRA-ATLAS-ADDITIVE-ACTIVATION-01 — SOURCE OF TRUTH das propriedades de vídeo
// por MODEL+MODE. Metadata do catálogo tem PRIORIDADE; quando ausente, cai no
// fallback histórico por backend (PiAPI INALTERADO — paridade byte-a-byte). UI e
// validação do servidor consomem a MESMA verdade (nada de if/else espalhado no JSX).

export type AudioMode = "always" | "toggle" | "none";

export interface VideoDuration {
  kind: "enum" | "range";
  values?: number[]; // kind=enum
  min?: number; // kind=range
  max?: number; // kind=range
}

export interface VideoReferences {
  kinds: Array<"image" | "video">;
  min: number;
  max: number;
  /** Campo do provider (image_url / image_urls / refers / start_image ...). Informativo p/ UI. */
  field?: string;
}

export interface VideoCapabilities {
  resolutions: string[];
  duration: VideoDuration;
  aspectRatios: string[];
  audio: AudioMode;
  references: VideoReferences | null;
  special: string[]; // "multi-shot" | "motion-control" | "omni" | "start-end"
  durationRuleNote?: string; // ex.: "1080p requires 8s"
}

export interface VideoModelForCaps {
  model_id?: string | null;
  backend?: string | null;
  task_type?: string | null;
  family?: string | null;
  runtime_provider?: string | null;
  resolution?: string | null;
  dur_min?: number | null;
  dur_max?: number | null;
  has_audio?: boolean | null;
  modes?: string[] | null;
  badges?: string[] | null;
  max_reference_images?: number | null;
  // Metadata explícita (fonte de verdade primária — Atlas preenche):
  resolutions?: string[] | null;
  resolution_by_mode?: Record<string, string[]> | null;
  aspect_ratios?: string[] | null;
  duration_options?: number[] | null;
  duration_by_resolution?: Record<string, number[]> | null;
  audio_mode?: AudioMode | null;
  capabilities_by_mode?: Record<string, Partial<{
    resolutions: string[];
    aspectRatios: string[];
    duration: VideoDuration;
    audio: AudioMode;
    references: VideoReferences;
    special: string[];
  }>> | null;
}

const RES_VIDEO_DEFAULT = ["480p", "720p", "1080p"];
const ASPECT_VIDEO_DEFAULT = ["16:9", "9:16", "1:1", "4:3", "3:4"];

const low = (s: string | null | undefined) => (s || "").toLowerCase();

/** Fallback histórico de resolução por backend (PiAPI — idêntico ao dock atual). */
function fallbackResolutions(m: VideoModelForCaps, duration: number): string[] {
  const backend = low(m.backend);
  const taskType = low(m.task_type);
  const family = low(m.family);
  if (backend === "wan") return ["720p", "1080p"];
  if (backend === "veo3" || backend === "veo3.1") return ["720p", "1080p"];
  if (backend === "seedance" && (taskType.includes("fast") || taskType.includes("mini"))) {
    return ["480p", "720p"];
  }
  if (backend === "hailuo") {
    const eff = duration <= 8 ? 6 : 10;
    return eff === 6 ? ["768p", "1080p"] : ["768p"];
  }
  if ((family === "kling" || backend === "kling" || backend === "kling-turbo") &&
      taskType !== "avatar" && taskType !== "motion_control") {
    return ["720p", "1080p"];
  }
  return RES_VIDEO_DEFAULT;
}

/** Fallback histórico de aspect ratio por backend (PiAPI — idêntico ao dock atual). */
function fallbackAspects(m: VideoModelForCaps): string[] {
  const backend = low(m.backend);
  const family = low(m.family);
  if (backend === "veo3" || backend === "veo3.1") return ["16:9", "9:16"];
  if (backend === "hailuo") return ["16:9", "9:16", "1:1"];
  if (family === "kling" || backend === "kling" || backend === "kling-turbo") return ["16:9", "9:16", "1:1"];
  if (backend === "wan") return ["16:9", "9:16", "1:1", "4:3", "3:4"];
  return ASPECT_VIDEO_DEFAULT;
}

/** Fallback histórico de duração-enum por backend (PiAPI — idêntico ao dock atual). */
function fallbackDurationEnum(m: VideoModelForCaps): number[] | null {
  const backend = low(m.backend);
  if (backend === "wan") return [5, 10, 15];
  if (backend === "hailuo") return [6, 10];
  if (backend === "veo3" || backend === "veo3.1") return [4, 6, 8];
  return null;
}

/**
 * Verdade de capabilities por MODEL+MODE. `duration` (atual) só afeta o fallback
 * do Hailuo (resolução 1080p só com 6s). Metadata sempre tem prioridade.
 */
export function resolveVideoCapabilities(
  m: VideoModelForCaps,
  mode: string | undefined,
  currentDuration = 6
): VideoCapabilities {
  const modeKey = mode || "text-to-video";
  const byMode = (m.capabilities_by_mode && m.capabilities_by_mode[modeKey]) || {};

  // ── Resolutions ──────────────────────────────────────────────────────────
  const resolutions =
    byMode.resolutions ??
    (m.resolution_by_mode && m.resolution_by_mode[modeKey]) ??
    m.resolutions ??
    fallbackResolutions(m, currentDuration);

  // ── Aspect ratios ────────────────────────────────────────────────────────
  const aspectRatios = byMode.aspectRatios ?? m.aspect_ratios ?? fallbackAspects(m);

  // ── Duration ─────────────────────────────────────────────────────────────
  let duration: VideoDuration;
  if (byMode.duration) duration = byMode.duration;
  else if (Array.isArray(m.duration_options) && m.duration_options.length) {
    duration = { kind: "enum", values: m.duration_options };
  } else {
    const enumVals = fallbackDurationEnum(m);
    duration = enumVals
      ? { kind: "enum", values: enumVals }
      : { kind: "range", min: m.dur_min ?? 4, max: m.dur_max ?? 15 };
  }

  // ── Audio ────────────────────────────────────────────────────────────────
  const audio: AudioMode =
    byMode.audio ?? m.audio_mode ?? (m.has_audio === false ? "none" : "toggle");

  // ── References ───────────────────────────────────────────────────────────
  let references: VideoReferences | null = byMode.references ?? null;
  if (!references) {
    if (modeKey === "reference-to-video" || modeKey === "omni" || modeKey === "reference-mixed") {
      const max = m.max_reference_images ?? 1;
      references = { kinds: ["image"], min: 1, max: Math.max(1, max), field: "refers" };
    } else if (modeKey === "image-to-video") {
      references = { kinds: ["image"], min: 1, max: 1, field: "image_url" };
    } else if (modeKey === "start-end-frame") {
      references = { kinds: ["image"], min: 2, max: 2, field: "image_url+last_image" };
    }
  }

  // ── Special features (badges/modes) ──────────────────────────────────────
  const special = byMode.special ?? deriveSpecial(m);

  const out: VideoCapabilities = { resolutions, duration, aspectRatios, audio, references, special };
  // Regra "1080p requires 8s" (duração por resolução) — informativa p/ UI + validação.
  if (m.duration_by_resolution) out.durationRuleNote = "duration varies by resolution";
  return out;
}

function deriveSpecial(m: VideoModelForCaps): string[] {
  const s = new Set<string>();
  const modes = (m.modes || []).map(low);
  const badges = (m.badges || []).map(low);
  if (modes.includes("multi-shot") || badges.includes("multi")) s.add("multi-shot");
  if (modes.includes("omni") || badges.includes("omni")) s.add("omni");
  if (low(m.task_type) === "motion_control") s.add("motion-control");
  if (modes.includes("start-end-frame")) s.add("start-end");
  return [...s];
}

/** Duração permitida considerando a resolução escolhida (regra 1080p-only-8s etc.). */
export function durationsForResolution(
  caps: VideoCapabilities,
  m: VideoModelForCaps,
  resolution: string | undefined
): VideoDuration {
  if (resolution && m.duration_by_resolution && m.duration_by_resolution[resolution]) {
    return { kind: "enum", values: m.duration_by_resolution[resolution] };
  }
  return caps.duration;
}
