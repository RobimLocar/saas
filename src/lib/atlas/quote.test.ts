// FLUXYRA-AI-PRODUCTION-02 — testes do quote /calculate (fetch MOCKADO, sem rede).
import {
  atlasOriginPriceToRawCredits,
  atlasQuoteToRawCredits,
  quoteAtlasGenerationCost,
  cachedQuoteAtlas,
  _clearAtlasQuoteCache,
  COST_BUDGET_PER_CREDIT_USD,
  type AtlasQuote,
} from "@/lib/atlas/quote";
import { test } from "vitest";

test("quote.test.ts", async () => {
const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

function mockFetch(payload: Record<string, unknown>, counter?: { n: number }) {
  (globalThis as { fetch: unknown }).fetch = async () => {
    if (counter) counter.n++;
    return { ok: true, status: 200, json: async () => ({ data: payload }) } as unknown as Response;
  };
}

async function run() {
  process.env.ATLAS_API_KEY = "test-key-never-logged";

  // ── Conversão determinística (margem §5.1) ─────────────────────────────────
  const expected010 = Math.ceil(0.10 / COST_BUDGET_PER_CREDIT_USD);
  check("origin→credits determinístico", atlasOriginPriceToRawCredits(0.10) === expected010);
  check("piso de 1 crédito", atlasOriginPriceToRawCredits(0) === 1 && atlasOriginPriceToRawCredits(-5) === 1);
  check("custo maior → mais créditos", atlasOriginPriceToRawCredits(1.0) > atlasOriginPriceToRawCredits(0.1));

  // ── quote usa origin_price, NÃO o preço com desconto (§4) ──────────────────
  mockFetch({ origin_price: 0.10, price: 0.07, discount: 70, estimated: false });
  const q1 = await quoteAtlasGenerationCost({ model: "m", resolution: "1080p", duration: 5 });
  check("quote ok", q1.ok === true);
  check("origin_price capturado", q1.originPriceUsd === 0.10);
  check("price (desconto) capturado separado", q1.priceUsd === 0.07);
  const r1 = atlasQuoteToRawCredits(q1);
  check("créditos baseados em ORIGIN (não desconto)", r1.ok && r1.rawCredits === atlasOriginPriceToRawCredits(0.10));
  check("origin ≠ conversão do preço com desconto", r1.rawCredits !== atlasOriginPriceToRawCredits(0.07));

  // ── token-billed (estimated) → fator conservador (upper bound §7) ──────────
  mockFetch({ origin_price: 0.10, price: 0.10, estimated: true, estimated_tokens: 12345 });
  const q2 = await quoteAtlasGenerationCost({ model: "seedance-2.x", resolution: "4k", duration: 5 });
  check("estimated=true detectado", q2.estimated === true && q2.estimatedTokens === 12345);
  const r2 = atlasQuoteToRawCredits(q2, { estimatedSafetyFactor: 1.25 });
  check("estimated aplica safety factor (> determinístico)", r2.rawCredits > atlasOriginPriceToRawCredits(0.10));
  check("estimated = ceil(origin×1.25)", r2.rawCredits === atlasOriginPriceToRawCredits(0.10 * 1.25));

  // ── cache: 2 chamadas mesma chave → 1 fetch ────────────────────────────────
  _clearAtlasQuoteCache();
  const counter = { n: 0 };
  mockFetch({ origin_price: 0.05, price: 0.05, estimated: false }, counter);
  const body = { model: "m2", resolution: "720p", duration: 4 };
  await cachedQuoteAtlas(body);
  await cachedQuoteAtlas(body);
  check("cache: 1 fetch para 2 quotes idênticos", counter.n === 1);
  const body2 = { model: "m2", resolution: "1080p", duration: 4 };
  await cachedQuoteAtlas(body2);
  check("cache: chave diferente → novo fetch", counter.n === 2);

  // ── sem key → erro, sem crash ──────────────────────────────────────────────
  const savedKey = process.env.ATLAS_API_KEY;
  delete process.env.ATLAS_API_KEY;
  const q3: AtlasQuote = await quoteAtlasGenerationCost({ model: "m" });
  check("sem key → ok=false + erro", q3.ok === false && !!q3.error);
  process.env.ATLAS_API_KEY = savedKey;

  if (failures.length) throw new Error("quote.test falhou:\n - " + failures.join("\n - "));
  console.log("quote.test: OK");
}

void run().then(() => {}, (e) => { console.error(e.message); process.exit(1); });
});
