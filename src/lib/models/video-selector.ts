// COMPETITOR-VIDEO-01 — Fonte da verdade do SELETOR de vídeo (dois níveis:
// família → variante). PURA e dirigida por METADATA do catálogo (/api/models):
// nada de arrays globais de resolução/duração. Assim adicionar/remover variante é
// só catálogo — o componente não muda. Reutiliza os campos já expostos pelo /api/models.

export interface VideoModelMeta {
  id: string;
  model_id: string;
  name: string;
  family?: string | null;
  family_description?: string | null;
  resolution?: string | null;
  dur_min?: number | null;
  dur_max?: number | null;
  duration_range?: string | null;
  has_audio?: boolean | null;
  badges?: string[] | null;
  modes?: string[] | null;
  resolution_duration_rule?: string | null;
  credit_per_second?: Record<string, number> | null;
  max_reference_images?: number | null;
  // COMPETITOR-VIDEO-04 — restrição de resolução POR MODO (ex.: Grok reference = 480/720).
  resolution_by_mode?: Record<string, string[]> | null;
  available?: boolean;
}

// Ordem de família = benchmark do Product Owner.
export const VIDEO_FAMILY_ORDER = [
  "Kling",
  "Seedance",
  "Veo",
  "Hailuo",
  "Grok",
  "Flux 3 Video",
  "LTX",
  "Gemini Omni Flash",
];

export interface VideoFamilyGroup {
  family: string;
  description: string;
  variants: VideoModelMeta[];
}

/** Agrupa modelos por família na ordem do benchmark (famílias desconhecidas ao fim). */
export function groupVideoModelsByFamily(models: VideoModelMeta[]): VideoFamilyGroup[] {
  const byFamily = new Map<string, VideoModelMeta[]>();
  for (const m of models) {
    const fam = (m.family || "Outros").trim();
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(m);
  }
  const orderIndex = (f: string) => {
    const i = VIDEO_FAMILY_ORDER.indexOf(f);
    return i === -1 ? VIDEO_FAMILY_ORDER.length : i;
  };
  return [...byFamily.entries()]
    .sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]) || a[0].localeCompare(b[0]))
    .map(([family, variants]) => ({
      family,
      description: variants.find((v) => v.family_description)?.family_description || "",
      variants,
    }));
}

/** Badges reais do modelo (nunca por marketing — vêm do catálogo). */
export function modelBadges(m: VideoModelMeta): string[] {
  return Array.isArray(m.badges) ? m.badges : [];
}

/** Modos reais suportados (text-to-video, frames, multi-shot, omni, motion-control...). */
export function modelModes(m: VideoModelMeta): string[] {
  return Array.isArray(m.modes) && m.modes.length > 0 ? m.modes : ["text-to-video"];
}

/** Resoluções ofertáveis = chaves do credit_per_second (metadata por modelo), com
 *  fallback para o rótulo `resolution`. Nunca um array global. */
export function resolutionOptions(m: VideoModelMeta): string[] {
  const cps = m.credit_per_second;
  if (cps && typeof cps === "object") {
    const keys = Object.keys(cps).filter((k) => Number(cps[k]) > 0);
    if (keys.length > 0) return keys;
  }
  return m.resolution ? [m.resolution] : [];
}

export function durationBounds(m: VideoModelMeta): { min: number; max: number } {
  return { min: Number(m.dur_min) || 0, max: Number(m.dur_max) || 0 };
}

/** Chips visuais (resolução + duração) a partir da metadata. */
export function modelChips(m: VideoModelMeta): string[] {
  const chips: string[] = [];
  if (m.resolution) chips.push(m.resolution);
  if (m.duration_range) chips.push(m.duration_range);
  else {
    const b = durationBounds(m);
    if (b.min && b.max) chips.push(`${b.min}s–${b.max}s`);
  }
  return chips;
}

export type ComboResult = { ok: true } | { ok: false; reason: string };

/**
 * Valida a combinação (resolução, duração) contra a metadata do modelo — para a UI
 * BLOQUEAR antes de gerar (o route também rejeita pré-débito). Sem correção silenciosa.
 * Regras especiais declaradas em `resolution_duration_rule` (ex.: Veo 3.1 Lite:
 * "1080p requires 8s").
 */
/** Resoluções válidas p/ o modo: restrição por-modo tem prioridade sobre a do SKU. */
export function resolutionOptionsForMode(m: VideoModelMeta, mode?: string): string[] {
  if (mode && m.resolution_by_mode && Array.isArray(m.resolution_by_mode[mode])) {
    return m.resolution_by_mode[mode];
  }
  return resolutionOptions(m);
}

export function isValidCombo(
  m: VideoModelMeta,
  sel: { resolution?: string; duration?: number; referenceCount?: number; mode?: string }
): ComboResult {
  const resOpts = resolutionOptionsForMode(m, sel.mode);
  if (sel.resolution && resOpts.length > 0 && !resOpts.includes(sel.resolution)) {
    return { ok: false, reason: `Resolução ${sel.resolution} não suportada por ${m.name}${sel.mode ? ` no modo ${sel.mode}` : ""}.` };
  }
  if (typeof sel.referenceCount === "number" && m.max_reference_images != null && sel.referenceCount > m.max_reference_images) {
    return { ok: false, reason: `Máximo de ${m.max_reference_images} imagens de referência.` };
  }
  if (typeof sel.duration === "number") {
    const { min, max } = durationBounds(m);
    if (min && sel.duration < min) return { ok: false, reason: `Duração mínima é ${min}s.` };
    if (max && sel.duration > max) return { ok: false, reason: `Duração máxima é ${max}s.` };
  }
  // Regra especial res×dur (declarativa, parse simples "<res> requires <n>s").
  const rule = m.resolution_duration_rule;
  if (rule) {
    const match = /^(\S+)\s+requires\s+(\d+)s$/i.exec(rule.trim());
    if (match) {
      const [, ruleRes, ruleDurStr] = match;
      const ruleDur = Number(ruleDurStr);
      if (sel.resolution === ruleRes && typeof sel.duration === "number" && sel.duration !== ruleDur) {
        return { ok: false, reason: `${ruleRes} exige duração de ${ruleDur}s.` };
      }
    }
  }
  return { ok: true };
}

export function hasNativeAudio(m: VideoModelMeta): boolean {
  return m.has_audio === true;
}
