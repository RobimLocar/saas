import { MIN_MARGIN } from "@/lib/constants";

// FLUXYRA-AI-PRODUCTION-02 §3/§4/§5/§6 — Atlas /calculate quote → Fluxyra credits.
// Endpoint oficial: POST /api/v1/model/calculate — NÃO cria task, NÃO cobra saldo,
// retorna { price, origin_price, discount, estimated, estimated_tokens }. Usado para
// resolver o custo de modelos que NÃO cabem em cps estático (compound/token/frame).
// NUNCA loga a API key. Base de preço = origin_price (list price), não o desconto
// promocional da nossa conta — para não depender de promoção temporária (§4).

const BASE_URL = "https://api.atlascloud.ai";

// ── Regra comercial APROVADA (§5.1): margem mínima no PIOR caso (plano Agency) ──
// Não inventamos margem nova. Ancoramos no MENOR preço/crédito que o usuário paga.
// Fonte (src/lib/stripe/client.ts, não importado aqui p/ evitar init do SDK Stripe):
//   Agency mensal = $149.00 / 10000 cr = $0.0149/cr  (MENOR — pior caso)
//   Top-up mais barato/crédito = pack_2000 $89.99 / 4000 cr = $0.0225/cr
// O pior caso (menor receita/crédito) é o plano Agency.
export const WORST_CASE_PRICE_PER_CREDIT_USD = 149 / 10000; // $0.0149/cr (Agency)
/** Receita/crédito disponível para custo do provider após reservar MIN_MARGIN. */
export const COST_BUDGET_PER_CREDIT_USD = WORST_CASE_PRICE_PER_CREDIT_USD * (1 - MIN_MARGIN);

/**
 * Converte um custo de provider (USD, origin_price) em créditos BRUTOS Fluxyra
 * garantindo ≥ MIN_MARGIN no pior caso (Agency). Piso de 1 crédito. Determinístico.
 */
export function atlasOriginPriceToRawCredits(originPriceUsd: number): number {
  if (!(originPriceUsd > 0)) return 1;
  return Math.max(1, Math.ceil(originPriceUsd / COST_BUDGET_PER_CREDIT_USD));
}

export interface AtlasQuote {
  ok: boolean;
  originPriceUsd: number | null;
  priceUsd: number | null;
  discount: number | null;
  estimated: boolean;
  estimatedTokens: number | null;
  error: string | null;
}

/** POST /api/v1/model/calculate. body = corpo REAL de geração (model + specs). */
export async function quoteAtlasGenerationCost(
  providerBody: Record<string, unknown>,
  opts: { apiKey?: string; signal?: AbortSignal } = {}
): Promise<AtlasQuote> {
  const key = opts.apiKey ?? process.env.ATLAS_API_KEY ?? "";
  const base: AtlasQuote = {
    ok: false, originPriceUsd: null, priceUsd: null, discount: null,
    estimated: false, estimatedTokens: null, error: null,
  };
  if (!key) return { ...base, error: "ATLAS_API_KEY ausente" };
  try {
    const res = await fetch(`${BASE_URL}/api/v1/model/calculate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(providerBody),
      signal: opts.signal,
    });
    if (!res.ok) return { ...base, error: `calculate HTTP ${res.status}` };
    const json = (await res.json()) as { data?: Record<string, unknown> };
    const d = json.data ?? (json as Record<string, unknown>);
    return {
      ok: true,
      originPriceUsd: typeof d.origin_price === "number" ? d.origin_price : Number(d.origin_price) || null,
      priceUsd: typeof d.price === "number" ? d.price : Number(d.price) || null,
      discount: typeof d.discount === "number" ? d.discount : null,
      estimated: d.estimated === true,
      estimatedTokens: typeof d.estimated_tokens === "number" ? d.estimated_tokens : null,
      error: null,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Pré-débito seguro a partir de um quote. Para token-billed (estimated=true) aplica
 * um fator conservador (upper bound) porque o custo final pode variar (§7). Usa
 * SEMPRE origin_price como base (§4). Retorna créditos BRUTOS (antes do plano).
 */
export function atlasQuoteToRawCredits(
  q: AtlasQuote,
  opts: { estimatedSafetyFactor?: number } = {}
): { ok: boolean; rawCredits: number; error: string | null } {
  if (!q.ok || !(q.originPriceUsd && q.originPriceUsd > 0)) {
    return { ok: false, rawCredits: 0, error: q.error || "quote sem origin_price" };
  }
  const factor = q.estimated ? Math.max(1, opts.estimatedSafetyFactor ?? 1.25) : 1;
  return { ok: true, rawCredits: atlasOriginPriceToRawCredits(q.originPriceUsd * factor), error: null };
}

// ── Cache server-side curto por (model|mode|resolution|duration|refs) (§6) ────
interface CacheEntry { q: AtlasQuote; at: number }
const quoteCache = new Map<string, CacheEntry>();
const QUOTE_TTL_MS = 10 * 60 * 1000;

/** Chave estável dos params que afetam custo. */
export function quoteCacheKey(providerBody: Record<string, unknown>): string {
  const b = providerBody;
  return [
    b.model ?? "",
    b.resolution ?? "",
    b.duration ?? b.num_frames ?? "",
    b.generate_audio ?? b.with_audio ?? "",
    Array.isArray(b.refers) ? (b.refers as unknown[]).length : Array.isArray(b.image_urls) ? (b.image_urls as unknown[]).length : 0,
  ].join("|");
}

/** Quote com cache. Reuso dentro do TTL evita bater no /calculate a cada request. */
export async function cachedQuoteAtlas(
  providerBody: Record<string, unknown>,
  opts: { apiKey?: string; signal?: AbortSignal; now?: number } = {}
): Promise<AtlasQuote> {
  const now = opts.now ?? Date.now();
  const key = quoteCacheKey(providerBody);
  const hit = quoteCache.get(key);
  if (hit && now - hit.at < QUOTE_TTL_MS && hit.q.ok) return hit.q;
  const q = await quoteAtlasGenerationCost(providerBody, opts);
  if (q.ok) quoteCache.set(key, { q, at: now });
  return q;
}

/** Uso em teste. */
export function _clearAtlasQuoteCache(): void {
  quoteCache.clear();
}
