// P9a — Resoluções de PRODUTO por modelo de imagem (FONTE ÚNICA compartilhada por
// Studio, Flow e a rota /api/generate/image, para não divergirem).
//
// Só o Nano Banana Pro vende os tiers 2K/4K (billing por resolução via
// credit_cost_map). Todos os demais SKUs ATIVOS entregam 1K — para eles, as
// DIMENSÕES reais vêm do ASPECT RATIO (ex.: GPT Image 2 → 1024x1024 / 1024x1536 /
// 1536x1024), e "1K" é apenas o tier de produto. Não confundir tier de resolução
// com aspect ratio.
//
// Não é um "ImageUISpec" rico — é a menor tabela de capacidade suficiente.

export function imageResolutionOptions(modelId: string | null | undefined): string[] {
  return modelId === "nano-banana-pro" ? ["1K", "2K", "4K"] : ["1K"];
}

/** true se `resolution` é um tier de produto SUPORTADO pelo modelo (validação pré-débito). */
export function isImageResolutionSupported(
  modelId: string | null | undefined,
  resolution: string | null | undefined
): boolean {
  if (!resolution) return true; // ausente/legado: sem escolha explícita → OK (default do modelo)
  return imageResolutionOptions(modelId).includes(resolution);
}
