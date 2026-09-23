// P5d1b — Testes da matemática pura de billing TTS por caractere.
// Runner-agnóstico: assertivas rodam no import (falham alto em vitest/jest/tsx).
// Zero rede, zero Supabase, zero API. Prova: contagem Unicode, fórmula base,
// boundaries, multiplicador de plano (matriz), list price e fail-closed config.

import {
  countTtsCharacters,
  calculateTtsBaseCredits,
  calculateTtsProviderListPriceUsd,
  isValidTtsPerKCharConfig,
  TTS_MAX_CHARACTERS,
} from "./tts-pricing";
import { applyPlanMultiplier } from "./plan-cost";
import { test } from "vitest";

test("tts-pricing.test.ts", async () => {

const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ── Character count (Unicode code points) ────────────────────────────────────
chk("count hello=5", countTtsCharacters("hello") === 5);
chk("count ação=4", countTtsCharacters("ação") === 4);
chk("count 你好=2", countTtsCharacters("你好") === 2);
chk("count 😀=1 (code point, não UTF-16)", countTtsCharacters("😀") === 1);
chk("count família ZWJ=7 (code points)", countTtsCharacters("👨‍👩‍👧‍👦") === 7);
chk("count vazio=0", countTtsCharacters("") === 0);
chk("count não-string=0", countTtsCharacters(undefined) === 0 && countTtsCharacters(123 as unknown) === 0);
// Sanidade: NÃO usar text.length (contaria emoji em dobro / ZWJ como 11).
chk("emoji difere de text.length", "😀".length === 2 && countTtsCharacters("😀") === 1);

// ── Base credits: fórmula max(1, ceil(chars/1000 × RATE)), RATE=12 ────────────
const RATE = 12;
const base = (c: number) => calculateTtsBaseCredits(c, RATE);
chk("base(0)=1 (piso)", base(0) === 1);
chk("base(1)=1", base(1) === 1);
chk("base(999)=12", base(999) === 12);          // ceil(999/1000*12)=ceil(11.988)=12
chk("base(1000)=12", base(1000) === 12);        // ceil(12)=12
chk("base(1001)=13", base(1001) === 13);        // ceil(12.012)=13
chk("base(2500)=30", base(2500) === 30);        // ceil(30)=30
chk("base(5000)=60", base(5000) === 60);        // ceil(60)=60

// RATE vem da config (não hardcode): mudar o RATE muda o custo.
chk("rate-source: RATE=24 dobra", calculateTtsBaseCredits(1000, 24) === 24);
chk("rate-source: RATE=6 metade", calculateTtsBaseCredits(1000, 6) === 6);

// ── Plan multiplier matrix (1000 chars, base 12) ─────────────────────────────
// effectiveCost/applyPlanMultiplier = ceil(base × mult): free2/starter1.3/pro1.1/agency1.
const b1k = base(1000); // 12
chk("plan agency 1000ch=12", applyPlanMultiplier(b1k, "agency") === 12);
chk("plan pro 1000ch=14", applyPlanMultiplier(b1k, "pro") === 14);     // ceil(13.2)
chk("plan starter 1000ch=16", applyPlanMultiplier(b1k, "starter") === 16); // ceil(15.6)
chk("plan free 1000ch=24", applyPlanMultiplier(b1k, "free") === 24);   // 12×2
chk("plan desconhecido=base", applyPlanMultiplier(b1k, "base") === 12);

// 5000 chars final por plano (base 60)
const b5k = base(5000); // 60
chk("agency 5000ch=60", applyPlanMultiplier(b5k, "agency") === 60);
chk("free 5000ch=120", applyPlanMultiplier(b5k, "free") === 120);

// ── Provider list price (USD, proporcional) ──────────────────────────────────
chk("list 1000ch=$0.10", near(calculateTtsProviderListPriceUsd(1000, 0.10), 0.10));
chk("list 500ch=$0.05", near(calculateTtsProviderListPriceUsd(500, 0.10), 0.05));
chk("list 5000ch=$0.50", near(calculateTtsProviderListPriceUsd(5000, 0.10), 0.50));
chk("list 447ch≈$0.0447", near(calculateTtsProviderListPriceUsd(447, 0.10), 0.0447));

// ── Config validation (fail-closed) ──────────────────────────────────────────
chk("config válida (12)", isValidTtsPerKCharConfig({ baseCreditsPerKChar: 12 }) === true);
chk("config inválida ausente", isValidTtsPerKCharConfig({}) === false);
chk("config inválida 0", isValidTtsPerKCharConfig({ baseCreditsPerKChar: 0 }) === false);
chk("config inválida negativa", isValidTtsPerKCharConfig({ baseCreditsPerKChar: -5 }) === false);
chk("config inválida NaN", isValidTtsPerKCharConfig({ baseCreditsPerKChar: NaN }) === false);
chk("config inválida string", isValidTtsPerKCharConfig({ baseCreditsPerKChar: "12" as unknown as number }) === false);

// ── Limite oficial ───────────────────────────────────────────────────────────
chk("TTS_MAX_CHARACTERS=5000", TTS_MAX_CHARACTERS === 5000);

if (fails.length > 0) {
  throw new Error("tts-pricing.test falhou:\n - " + fails.join("\n - "));
}
console.log("tts-pricing.test: OK (todas as assertivas passaram)");
});
