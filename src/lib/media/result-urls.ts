// P5g1 — Fundação multi-output (provider-agnostic). Helpers puros para
// normalizar/ler múltiplas URLs de resultado, mantendo compatibilidade total
// com o contrato legado `result_url` (scalar). NÃO conhece Kling nem nenhum
// provider específico — apenas normaliza dados já extraídos.

/** Entrada conceitual do normalizador (espelha StatusResult). */
export interface ResultUrlInput {
  resultUrl?: string | null;
  resultUrls?: string[] | null;
}

/**
 * Normaliza { resultUrl, resultUrls } → string[].
 * Regras (P5g1 FASE 7):
 *   1. preserva ordem;
 *   2. inclui resultUrl como PRIMARY quando existir (primeiro);
 *   3. acrescenta resultUrls;
 *   4. remove strings vazias/whitespace;
 *   5. remove duplicatas preservando a 1ª ocorrência;
 *   6. não inventa URL;
 *   7. só scalar → [resultUrl]; nada → [].
 * Não limita artificialmente o número de outputs.
 */
export function normalizeResultUrls(input: ResultUrlInput): string[] {
  const ordered: string[] = [];
  if (typeof input.resultUrl === "string") ordered.push(input.resultUrl);
  if (Array.isArray(input.resultUrls)) {
    for (const u of input.resultUrls) {
      if (typeof u === "string") ordered.push(u);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ordered) {
    const u = raw.trim();
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Shape mínimo de uma generation para a leitura de resultado na UI. */
export interface GenerationResultShape {
  result_url?: string | null;
  params?: { result_urls?: unknown } | null;
}

/**
 * UI: lista de URLs de resultado de uma generation (P5g1 FASE 19).
 *   1. se params.result_urls é array válido não-vazio → usa (normalizado);
 *   2. senão → fallback [result_url];
 *   3. filtra inválidos, dedupe, preserva ordem.
 * NÃO conhece Kling. Usado por Feed e Lightbox (fonte única, sem duplicar lógica).
 */
export function getGenerationResultUrls(gen: GenerationResultShape): string[] {
  const rawArray = gen.params?.result_urls;
  const arr = Array.isArray(rawArray)
    ? rawArray.filter((u): u is string => typeof u === "string")
    : null;
  if (arr && arr.length > 0) {
    return normalizeResultUrls({ resultUrls: arr });
  }
  return normalizeResultUrls({ resultUrl: gen.result_url ?? undefined });
}
