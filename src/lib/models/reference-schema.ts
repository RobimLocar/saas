// FLUXYRA-AI-PRODUCT-COMPLETION-02 — verdade única de REFERÊNCIAS + params avançados
// + multi-shot Kling. Puro/determinístico. UI e servidor consomem estes helpers para
// não divergirem (§18/§20). Sem I/O.

export type MediaType = "image" | "video" | "audio" | "unknown";

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic)(\?|#|$)/i;
const VID_RE = /\.(mp4|mov|webm|mkv|avi|m4v)(\?|#|$)/i;
const AUD_RE = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i;

/** Tipo de mídia inferido pela extensão da URL. */
export function mediaTypeFromUrl(url: string): MediaType {
  if (typeof url !== "string") return "unknown";
  if (IMG_RE.test(url)) return "image";
  if (VID_RE.test(url)) return "video";
  if (AUD_RE.test(url)) return "audio";
  return "unknown";
}

export interface RefValidation {
  ok: boolean;
  error?: string;
}

/**
 * §17 — Referências mixtas (H3): refers[] aceita image/video/audio, MAS exige AO MENOS
 * uma IMAGEM ou VÍDEO. Audio-only → inválido (400 pré-débito). `unknown` (sem extensão)
 * é tratado como visual permissivo apenas quando `strict` é falso. Aplica limite `max`.
 */
export function validateReferenceRefs(
  refs: string[],
  opts: { requireVisual?: boolean; max?: number; strictUnknown?: boolean } = {}
): RefValidation {
  const urls = refs.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
  if (urls.length === 0) return { ok: false, error: "Envie ao menos uma referência." };
  if (opts.max && urls.length > opts.max) return { ok: false, error: `Máximo de ${opts.max} referências.` };
  if (opts.requireVisual) {
    const hasVisual = urls.some((u) => {
      const t = mediaTypeFromUrl(u);
      return t === "image" || t === "video" || (!opts.strictUnknown && t === "unknown");
    });
    if (!hasVisual) return { ok: false, error: "As referências devem incluir ao menos uma imagem ou vídeo (áudio sozinho não é válido)." };
  }
  return { ok: true };
}

// ── Multi-shot Kling (§7/§8) ─────────────────────────────────────────────────
export interface KlingShot {
  prompt: string;
  duration: number;
}
export interface MultiShotValidation {
  ok: boolean;
  error?: string;
}

/**
 * Valida multi-shot Kling: ≤6 shots; cada duração ≥1; soma das durações == duração
 * total selecionada. (Contrato técnico Kling 3.0 4K / O3.)
 */
export function validateKlingMultiShot(shots: KlingShot[], totalDuration: number): MultiShotValidation {
  if (!Array.isArray(shots) || shots.length === 0) return { ok: false, error: "Adicione ao menos um shot." };
  if (shots.length > 6) return { ok: false, error: "Máximo de 6 shots." };
  let sum = 0;
  for (const s of shots) {
    if (!s || typeof s.duration !== "number" || s.duration < 1) return { ok: false, error: "Cada shot deve ter duração ≥ 1s." };
    if (typeof s.prompt !== "string" || !s.prompt.trim()) return { ok: false, error: "Cada shot precisa de um prompt." };
    sum += s.duration;
  }
  if (sum !== totalDuration) return { ok: false, error: `A soma das durações dos shots (${sum}s) deve ser igual à duração total (${totalDuration}s).` };
  return { ok: true };
}

/** Monta o multi_prompt[] do provider a partir dos shots (após validação). */
export function buildKlingMultiPrompt(shots: KlingShot[]): Array<{ prompt: string; duration: number }> {
  return shots.map((s) => ({ prompt: s.prompt.trim(), duration: s.duration }));
}

// ── Advanced params (single source p/ UI + rota) ─────────────────────────────
export interface AdvancedParamSpec {
  id: string;
  type: "int" | "bool" | "string" | "voice_ids" | "enum";
  label: string;
  max?: number;
  /** Opções para type "enum" (valores exatos aceitos pelo servidor). */
  options?: string[];
}

const ADVANCED_LABELS: Record<string, { type: AdvancedParamSpec["type"]; label: string; max?: number; options?: string[] }> = {
  seed: { type: "int", label: "Seed" },
  camera_fixed: { type: "bool", label: "Câmera fixa" },
  prompt_expansion: { type: "bool", label: "Expandir prompt" },
  generate_audio: { type: "bool", label: "Gerar áudio" },
  sound: { type: "bool", label: "Som" },
  voice_ids: { type: "voice_ids", label: "Vozes", max: 3 },
  negative_prompt: { type: "string", label: "Prompt negativo" },
  cfg_scale: { type: "int", label: "CFG Scale" },
  // GEMINI-STANDARD-CONTRACT-FIX-01 §2 — enum string, NÃO inteiro.
  thinking_level: { type: "enum", label: "Thinking level", options: ["default", "low", "high"] },
};

// multi_shot/shot_type/multi_prompt/elements têm UI DEDICADA (editor de shots /
// subjects), não entram no painel avançado genérico.
const ADVANCED_PANEL_EXCLUDE = new Set(["generate_audio", "multi_shot", "shot_type", "multi_prompt", "elements"]);

// ── Grok voice presets (§1 — IDs OFICIAIS atuais Atlas) ──────────────────────
export const GROK_VOICE_IDS = [
  "altair", "ara", "atlas", "carina", "castor", "celeste", "cosmo", "eve", "helios",
  "helix", "iris", "kepler", "leo", "lumen", "luna", "lux", "naksh", "orion", "perseus",
  "rex", "rigel", "sal", "sirius", "ursa", "zagan", "zenith",
] as const;

/** Valida voice_ids: ≤3, todos presets oficiais. */
export function validateVoiceIds(ids: unknown): { ok: boolean; error?: string; value?: string[] } {
  if (ids === undefined || ids === null) return { ok: true, value: [] };
  if (!Array.isArray(ids)) return { ok: false, error: "voice_ids inválido" };
  if (ids.length > 3) return { ok: false, error: "Máximo de 3 vozes." };
  const set = new Set<string>(GROK_VOICE_IDS as readonly string[]);
  for (const id of ids) if (typeof id !== "string" || !set.has(id)) return { ok: false, error: `Voz inválida: ${String(id)}` };
  return { ok: true, value: ids as string[] };
}

// ── O3 subjects/elements (§5 — CONTRATO EXATO ATLAS) ─────────────────────────
// reference_type = "image_refer" | "video_refer" (NÃO "image"/"video").
// element_id (subject existente) é MUTUAMENTE EXCLUSIVO com definição inline
// (element_name/frontal_image/refer_images/refer_videos/element_description).
export type ElementRefType = "image_refer" | "video_refer";
export interface KlingElement {
  reference_type: ElementRefType;
  frontal_image?: string;
  refer_images?: string[];
  refer_videos?: string[];
  element_name?: string;
  element_description?: string;
  element_id?: string;
}
const isHttpU = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
const isNeStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Valida a lista de subjects/elements do Kling O3/4K no SHAPE OFICIAL atual:
 * reference_type image_refer/video_refer; image_refer exige material de imagem
 * (frontal_image|refer_images); video_refer exige refer_videos. element_id, quando
 * presente, é exclusivo com a definição inline. Aplica limite `max`.
 */
export function validateElements(elements: unknown, max = 4): { ok: boolean; error?: string; value?: KlingElement[] } {
  if (elements === undefined || elements === null) return { ok: true, value: [] };
  if (!Array.isArray(elements)) return { ok: false, error: "elements inválido" };
  if (elements.length > max) return { ok: false, error: `Máximo de ${max} subjects.` };
  const out: KlingElement[] = [];
  for (const el of elements as Array<Record<string, unknown>>) {
    const rt = el?.reference_type;
    if (rt !== "image_refer" && rt !== "video_refer")
      return { ok: false, error: "reference_type deve ser image_refer ou video_refer." };
    const hasInline = isNeStr(el.element_name) || isHttpU(el.frontal_image) ||
      (Array.isArray(el.refer_images) && el.refer_images.some(isHttpU)) ||
      (Array.isArray(el.refer_videos) && el.refer_videos.some(isHttpU)) ||
      isNeStr(el.element_description);
    if (isNeStr(el.element_id)) {
      if (hasInline) return { ok: false, error: "element_id é exclusivo com definição inline (nome/mídia)." };
      out.push({ reference_type: rt, element_id: el.element_id.trim() });
      continue;
    }
    if (rt === "image_refer") {
      const imgs = [el.frontal_image, ...(Array.isArray(el.refer_images) ? el.refer_images : [])].filter(isHttpU);
      if (imgs.length === 0) return { ok: false, error: "Subject image_refer precisa de ao menos uma imagem." };
      out.push({
        reference_type: "image_refer",
        frontal_image: isHttpU(el.frontal_image) ? el.frontal_image : undefined,
        refer_images: (Array.isArray(el.refer_images) ? el.refer_images : []).filter(isHttpU),
        element_name: isNeStr(el.element_name) ? el.element_name.trim() : undefined,
        element_description: isNeStr(el.element_description) ? el.element_description.trim() : undefined,
      });
    } else {
      const vids = (Array.isArray(el.refer_videos) ? el.refer_videos : []).filter(isHttpU);
      if (vids.length === 0) return { ok: false, error: "Subject video_refer precisa de ao menos um vídeo." };
      out.push({
        reference_type: "video_refer",
        refer_videos: vids,
        element_name: isNeStr(el.element_name) ? el.element_name.trim() : undefined,
        element_description: isNeStr(el.element_description) ? el.element_description.trim() : undefined,
      });
    }
  }
  return { ok: true, value: out };
}

/** Tag posicional 1-based que o Atlas usa no prompt para referenciar subjects. */
export function elementTag(index0: number): string {
  return `<<<element_${index0 + 1}>>>`;
}

/**
 * Valida + monta os campos avançados Kling 4K/O3 (multi_shot/shot_type/multi_prompt/
 * sound/cfg_scale/negative_prompt/elements). `shot_type`=intelligence NÃO usa multi_prompt.
 */
export function buildKlingAdvanced(
  v: {
    sound?: unknown; cfg_scale?: unknown; negative_prompt?: unknown;
    multi_shot?: unknown; shot_type?: unknown; multi_prompt?: unknown; elements?: unknown;
  },
  totalDuration: number,
  opts: { elementsMax?: number } = {}
): { ok: boolean; error?: string; body?: Record<string, unknown> } {
  const body: Record<string, unknown> = {};
  if (v.sound !== undefined) {
    if (typeof v.sound !== "boolean") return { ok: false, error: "sound deve ser boolean" };
    body.sound = v.sound;
  }
  if (v.cfg_scale !== undefined) {
    if (typeof v.cfg_scale !== "number" || v.cfg_scale < 0 || v.cfg_scale > 1) return { ok: false, error: "cfg_scale deve estar entre 0 e 1" };
    body.cfg_scale = v.cfg_scale;
  }
  if (typeof v.negative_prompt === "string" && v.negative_prompt.trim()) body.negative_prompt = v.negative_prompt.trim();
  if (v.multi_shot === true) {
    const st = v.shot_type;
    if (st !== "customize" && st !== "intelligence") return { ok: false, error: "shot_type deve ser customize ou intelligence" };
    body.multi_shot = true;
    body.shot_type = st;
    if (st === "customize") {
      const shots = Array.isArray(v.multi_prompt) ? (v.multi_prompt as KlingShot[]) : [];
      const ms = validateKlingMultiShot(shots, totalDuration);
      if (!ms.ok) return { ok: false, error: ms.error };
      body.multi_prompt = buildKlingMultiPrompt(shots);
    }
    // intelligence: sem multi_prompt manual.
  }
  if (v.elements !== undefined) {
    const ev = validateElements(v.elements, opts.elementsMax ?? 4);
    if (!ev.ok) return { ok: false, error: ev.error };
    if (ev.value && ev.value.length > 0) body.elements = ev.value;
  }
  return { ok: true, body };
}

/** Spec dos params avançados que o model+mode suporta (lê supported_params_by_mode). */
export function advancedParamsSpec(
  supportedByMode: Record<string, string[]> | null | undefined,
  supportedFlat: string[] | null | undefined,
  mode: string
): AdvancedParamSpec[] {
  const ids = (supportedByMode && supportedByMode[mode]) || supportedFlat || [];
  // generate_audio (toggle principal) e multi_shot/elements (UI dedicada) ficam fora.
  return ids
    .filter((id) => !ADVANCED_PANEL_EXCLUDE.has(id) && ADVANCED_LABELS[id])
    .map((id) => ({ id, ...ADVANCED_LABELS[id] }));
}
