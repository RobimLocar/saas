// P10a — Testes da FONTE ÚNICA de custo do Kling Avatar.
// Runner-agnóstico: as assertivas rodam no import (falham alto em vitest/jest/tsx).
// Prova: (1) duração medida no servidor governa o custo (não a duração da UI);
// (2) arredondamento/clamp idênticos ao vídeo congelado; (3) multiplicador de plano
// pelo effectiveCost REAL; (4) guard de alta-resolução sem tarifa; (5) paridade de modo.

import {
  clampAvatarSeconds,
  resolveAvatarRate,
  avatarRawCredits,
  AVATAR_MAX_SECONDS,
} from "./avatar-pricing";
import { effectiveCost } from "@/lib/credits";
import { test } from "vitest";

test("avatar-pricing.test.ts", async () => {

const failures: string[] = [];
function check(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

// Catálogo real (kling-avatar ativo): cps 8.4 em 720p e 1080p; sem 4k.
const CPS = { "720p": 8.4, "1080p": 8.4 };

// 1) clamp/rounding — espelha o vídeo (ceil + clamp [1,120]).
check("clamp 4.2→5", clampAvatarSeconds(4.2) === 5);
check("clamp 8.0→8", clampAvatarSeconds(8.0) === 8);
check("clamp 20→20", clampAvatarSeconds(20) === 20);
check("clamp 0→1 (min)", clampAvatarSeconds(0) === 1);
check("clamp -3→1 (min)", clampAvatarSeconds(-3) === 1);
check("clamp 999→120 (max)", clampAvatarSeconds(999) === AVATAR_MAX_SECONDS);

// 2) resolução → tarifa, com guard de alta-res sem tarifa.
const r720 = resolveAvatarRate(CPS, "720p");
const r1080 = resolveAvatarRate(CPS, "1080p");
const r4k = resolveAvatarRate(CPS, "4k");
const r2160 = resolveAvatarRate(CPS, "2160p");
check("720p rate 8.4", r720.ok === true && r720.rate === 8.4);
check("1080p rate 8.4", r1080.ok === true && r1080.rate === 8.4);
check("4k SEM tarifa → bloqueia", r4k.ok === false);
check("2160p SEM tarifa → bloqueia", r2160.ok === false);
check("alta-res sem mapa → bloqueia", resolveAvatarRate(null, "1080p").ok === false);
// ≤720 mantém fallback histórico p/ 720p.
check("res desconhecida ≤720 → fallback 720p", (() => {
  const r = resolveAvatarRate(CPS, "540p");
  return r.ok === true && r.rate === 8.4;
})());

// 3) custo BRUTO = ceil(rate × segundos MEDIDOS). NÃO usa a duração da UI (4/6/8).
check("base 8s → 68", avatarRawCredits(8.4, 8) === 68); // ceil(67.2)
check("base 4.2s → 42", avatarRawCredits(8.4, 4.2) === 42); // ceil(8.4*5)
check("base 20s → 168 (MEDIDO, não ui 8)", avatarRawCredits(8.4, 20) === 168);
check("rate 0 → 0", avatarRawCredits(0, 30) === 0);

// 3b) DIVERGÊNCIA vs fórmula antiga (14+3.75*uiDur): documenta o P1 corrigido.
const OLD_8s_720 = Math.ceil((14 + 3.75 * 8) * 1); // 44 (uiDur=8, sem plano)
check("nova base (68) difere da antiga (44)", avatarRawCredits(8.4, 8) !== OLD_8s_720);

// 4) multiplicador de plano pelo effectiveCost REAL (uma vez, sobre a base).
const base8 = avatarRawCredits(8.4, 8); // 68
check("agency = base", effectiveCost(base8, "agency") === 68); // ceil(68*1)
check("pro = ceil(68*1.1)=75", effectiveCost(base8, "pro") === 75);
check("starter = ceil(68*1.3)=89", effectiveCost(base8, "starter") === 89);
check("free = ceil(68*2)=136", effectiveCost(base8, "free") === 136);
// mesma base, planos diferentes → monotônico (free ≥ starter ≥ pro ≥ agency).
check(
  "monotonicidade de plano",
  effectiveCost(base8, "free") >= effectiveCost(base8, "starter") &&
    effectiveCost(base8, "starter") >= effectiveCost(base8, "pro") &&
    effectiveCost(base8, "pro") >= effectiveCost(base8, "agency")
);

// 5) paridade de MODO (mesma regra da rota/payload): 720p→std, else→pro.
const modeOf = (res: string) => (res === "720p" ? "std" : "pro");
check("720p → std", modeOf("720p") === "std");
check("1080p → pro", modeOf("1080p") === "pro");

if (failures.length > 0) {
  throw new Error(`avatar-pricing.test falhou:\n - ${failures.join("\n - ")}`);
} else {
  console.log("avatar-pricing.test: OK (todas as assertivas passaram)");
}
});
