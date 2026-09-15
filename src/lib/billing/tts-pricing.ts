// Matemática PURA de billing por caractere para TTS (sem Supabase/rede).
// Fonte única reutilizada pelo servidor (audio route) e pelo cliente (Studio
// dock/estimativa). NÃO chama Atlas /calculate em runtime — a taxa é local,
// vinda do catálogo (ai_models.params). /calculate fica para verificação/auditoria.
//
// Provider de referência: Atlas ElevenLabs v3 = list price $0.10 / 1.000 chars,
// cobrança PROPORCIONAL por caractere, limite 5.000 chars por request.

/** Limite oficial de caracteres do ElevenLabs v3 (fonte única deste valor). */
export const TTS_MAX_CHARACTERS = 5000;

/**
 * Conta caracteres para billing usando Unicode CODE POINTS (`Array.from`).
 * A doc de "Billing Examples" da Atlas descreve os modelos TTS cobrados por
 * caractere em termos de Unicode characters; a semântica de baixo nível
 * específica do ElevenLabs não é separadamente especificada — usamos code
 * points como aproximação estável (NÃO `text.length`, que conta surrogate
 * pairs em dobro; NÃO grapheme clusters).
 */
export function countTtsCharacters(text: unknown): number {
  if (typeof text !== "string") return 0;
  return Array.from(text).length;
}

/**
 * Créditos-base (nível Agency) a partir da contagem de caracteres.
 *   baseCredits = max(1, ceil(chars / 1000 × baseCreditsPerKChar))
 * O `baseCreditsPerKChar` (RATE) vem do catálogo — NUNCA hardcode na route.
 * Piso de 1 crédito para qualquer geração não-vazia.
 */
export function calculateTtsBaseCredits(
  characterCount: number,
  baseCreditsPerKChar: number
): number {
  const chars = Number.isFinite(characterCount) ? Math.max(0, characterCount) : 0;
  const rate = baseCreditsPerKChar;
  return Math.max(1, Math.ceil((chars / 1000) * rate));
}

/**
 * Estimativa do LIST PRICE do provider em USD (proporcional). É uma ESTIMATIVA
 * de referência (o preço efetivo da conta pode ter desconto — não modelado aqui).
 * Usado só para auditoria/metadata, nunca para cobrar o usuário.
 */
export function calculateTtsProviderListPriceUsd(
  characterCount: number,
  providerPricePerKCharUsd: number
): number {
  const chars = Number.isFinite(characterCount) ? Math.max(0, characterCount) : 0;
  return (chars / 1000) * providerPricePerKCharUsd;
}

/** Configuração de billing per_kchar lida de ai_models.params. */
export interface TtsPerKCharConfig {
  baseCreditsPerKChar: number;
  providerPricePerKCharUsd?: number;
  pricingVersion?: string;
}

/** Valida a config vinda do catálogo. Fail-closed: RATE ausente/≤0/NaN é inválido. */
export function isValidTtsPerKCharConfig(cfg: {
  baseCreditsPerKChar?: unknown;
}): boolean {
  const rate = cfg.baseCreditsPerKChar;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}
