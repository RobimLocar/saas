// FLUXYRA-PRODUCTION-CLOSE-01 §9 — Mode serializer. Garante que o request carregue
// SOMENTE os campos de mídia válidos para o modo ATIVO. Ex.: Grok Reference com refs
// → troca p/ Veo Text → refs NÃO entram no body; Veo Start-End → troca p/ Seedance
// Text → start/end frame NÃO entram. Puro/determinístico. O servidor continua sendo
// a autoridade (isValidCombo pré-débito); isto evita vazamento de rascunho no cliente.

/** Campos de mídia permitidos por modo de vídeo. Modo ausente = não serializa. */
export const VIDEO_MODE_MEDIA_FIELDS: Record<string, readonly string[]> = {
  "text-to-video": [],
  "image-to-video": ["start_image_url"],
  "start-end-frame": ["start_image_url", "end_image_url"],
  "reference-to-video": ["reference_images", "reference_image_urls"],
  "reference-mixed": ["reference_images", "reference_image_urls", "reference_videos"],
  "video-edit": ["reference_videos"],
  "video-extend": ["reference_videos"],
};

/** Todos os campos de mídia mode-específicos (candidatos a remoção). */
export const MODE_SPECIFIC_MEDIA_FIELDS = [
  "start_image_url",
  "end_image_url",
  "reference_images",
  "reference_image_urls",
  "reference_videos",
] as const;

/**
 * Remove do body os campos de mídia que NÃO pertencem ao `mode` ativo. Preserva
 * todo o resto (prompt/resolution/duration/aspect/with_audio/negative_prompt/etc.).
 * Se `mode` não estiver no mapa (modelo sem modos — PiAPI clássico), retorna o body
 * inalterado (não há troca de modo a proteger).
 */
export function serializeVideoRequestForMode<T extends Record<string, unknown>>(
  body: T,
  mode: string | undefined | null
): T {
  if (!mode || !(mode in VIDEO_MODE_MEDIA_FIELDS)) return body;
  const allowed = new Set(VIDEO_MODE_MEDIA_FIELDS[mode]);
  const out: Record<string, unknown> = { ...body };
  for (const field of MODE_SPECIFIC_MEDIA_FIELDS) {
    if (!allowed.has(field) && field in out) delete out[field];
  }
  return out as T;
}
