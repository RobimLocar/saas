// P9b — Cobrança DINÂMICA do GPT Image 2 (ratificada pelo Product Owner).
// FONTE ÚNICA: mapeamento de tamanho do provider + créditos BASE (raw). Usada pelo
// client (payload), pela rota (billing) e pela estimativa da UI, para não divergirem.
//
// Regra de PRODUTO (não é uma tarifa por token — token varia; +2/ref é um proxy
// CONSERVADOR):
//   output base:  square (1024x1024) = 4  ·  non-square (1024x1536 / 1536x1024) = 6
//   + 2 créditos BASE por imagem de referência
//   máx. 16 referências
//   O multiplicador de plano é aplicado UMA vez, DEPOIS (effectiveCost), fora daqui.

export const GPT_IMAGE_2_REFERENCE_SURCHARGE = 2;
export const GPT_IMAGE_2_MAX_REFS = 16;
export const GPT_IMAGE_2_MODEL_ID = "gpt-image-2";

export type GptImage2Size = "1024x1024" | "1536x1024" | "1024x1536";

/**
 * Mapeia aspect ratio → tamanho REAL renderizado pelo gpt-image-2. Mesma lógica que
 * o client envia no payload (`size`). square (w===h/ inválido) → 1024x1024;
 * landscape (w>h) → 1536x1024; portrait → 1024x1536.
 */
export function gptImage2ProviderSize(aspectRatio?: string | null): GptImage2Size {
  const [w, h] = (aspectRatio || "1:1").split(":").map(Number);
  if (!w || !h || w === h) return "1024x1024";
  return w > h ? "1536x1024" : "1024x1536";
}

/**
 * Créditos BASE (raw, ANTES do multiplicador de plano) do GPT Image 2:
 *   (square ? 4 : 6) + referenceCount * 2.
 * NÃO aplica multiplicador de plano (isso é `effectiveCost`, chamado uma vez pelo
 * consumidor).
 */
export function gptImage2RawCredits(opts: {
  aspectRatio?: string | null;
  referenceCount: number;
}): number {
  const outputBase = gptImage2ProviderSize(opts.aspectRatio) === "1024x1024" ? 4 : 6;
  const refs = Math.max(0, Math.floor(opts.referenceCount || 0));
  return outputBase + refs * GPT_IMAGE_2_REFERENCE_SURCHARGE;
}
