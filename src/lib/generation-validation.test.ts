// P6b — Testes da validação AUTORITATIVA de vídeo (pré-débito).
// Runner-agnóstico: as assertivas rodam no import (falham alto em vitest/jest/tsx).
// Cobre o gating de resolução (Hailuo/Kling) e de multishot (count/soma), sem
// tocar rede: nenhum caso usa URLs de referência válidas (os HEADs de
// observabilidade só disparam quando há URL http(s), o que estes testes evitam).

import { validateVideoRequest } from "./generation-validation";
import type { VideoModelParams } from "./piapi/client";
import { test } from "vitest";

test("generation-validation.test.ts", async () => {

const hailuo = { backend: "hailuo", dur_min: 6, dur_max: 10 } as VideoModelParams;
const kling = { backend: "kling", task_type: "video", dur_min: 3, dur_max: 15 } as VideoModelParams;
const klingTurbo = { backend: "kling-turbo", task_type: "video", dur_min: 5, dur_max: 10 } as VideoModelParams;
const klingMotion = { backend: "kling", task_type: "motion_control", dur_min: 3, dur_max: 30 } as VideoModelParams;
const klingAvatar = { backend: "kling", task_type: "avatar", dur_min: 4, dur_max: 8 } as VideoModelParams;
const veo = { backend: "veo3.1", dur_min: 4, dur_max: 8 } as VideoModelParams;

// Runner assíncrono e SEM top-level await (compatível com transform CJS e ESM).
async function runVideoValidationTests(): Promise<string[]> {
  const failures: string[] = [];
  const check = (name: string, cond: boolean): void => {
    if (!cond) failures.push(name);
  };
  const expectResult = async (
    name: string,
    input: Parameters<typeof validateVideoRequest>[0],
    params: VideoModelParams,
    expectOk: boolean,
    match?: string
  ): Promise<void> => {
    const r = await validateVideoRequest(input, params, "test");
    const ok = r.ok === expectOk && (match ? (r.error ?? "").includes(match) : true);
    check(name, ok);
  };

  // ── Hailuo: resolução verdadeira (nunca rebaixa em silêncio) ──────────────
  // P6d — a UI exibe 768p; "720p" é ALIAS LEGADO (ambos aceitos → provider/billing 768).
  await expectResult("hailuo 768p+6 ok (label novo)", { resolution: "768p", duration: 6 }, hailuo, true);
  await expectResult("hailuo 768p+10 ok (label novo)", { resolution: "768p", duration: 10 }, hailuo, true);
  await expectResult("hailuo 720p+6 ok (alias legado)", { resolution: "720p", duration: 6 }, hailuo, true);
  await expectResult("hailuo 720p+10 ok (alias legado)", { resolution: "720p", duration: 10 }, hailuo, true);
  await expectResult("hailuo 1080p+6 ok", { resolution: "1080p", duration: 6 }, hailuo, true);
  await expectResult("hailuo 1080p+8 ok (dur efetiva 6)", { resolution: "1080p", duration: 8 }, hailuo, true);
  await expectResult("hailuo 1080p+10 -> 400", { resolution: "1080p", duration: 10 }, hailuo, false, "1080p");
  await expectResult("hailuo 1080p+9 -> 400", { resolution: "1080p", duration: 9 }, hailuo, false, "1080p");
  await expectResult("hailuo 480p -> 400", { resolution: "480p", duration: 6 }, hailuo, false, "480p");

  // ── Kling: gating de resolução (720/1080 apenas; 480 rejeitado) ───────────
  await expectResult("kling 720p ok", { resolution: "720p", duration: 5 }, kling, true);
  await expectResult("kling 1080p ok", { resolution: "1080p", duration: 5 }, kling, true);
  await expectResult("kling 480p -> 400", { resolution: "480p", duration: 5 }, kling, false, "480p");
  await expectResult("kling-turbo 480p -> 400", { resolution: "480p", duration: 5 }, klingTurbo, false, "480p");
  // Avatar/Motion derivam resolução do modo → fora do escopo (não rejeitam 480 aqui).
  await expectResult("kling motion 480p permitido (fora de escopo)", { resolution: "480p", duration: 5 }, klingMotion, true);
  await expectResult("kling avatar 480p permitido (fora de escopo)", { resolution: "480p", duration: 5 }, klingAvatar, true);
  // Veo faz upgrade 480→720 no adapter → validação não bloqueia.
  await expectResult("veo 480p permitido (adapter faz upgrade)", { resolution: "480p", duration: 6 }, veo, true);

  // ── Multishot: count ≤ 6 e soma ≤ 15s ─────────────────────────────────────
  await expectResult("multishot 3x5=15 ok", { shots: [{ duration: 5 }, { duration: 5 }, { duration: 5 }] }, kling, true);
  await expectResult("multishot 4x5=20 -> 400", { shots: [{ duration: 5 }, { duration: 5 }, { duration: 5 }, { duration: 5 }] }, kling, false, "15s");
  await expectResult("multishot 7 shots -> 400", { shots: Array.from({ length: 7 }, () => ({ duration: 2 })) }, kling, false, "6 shots");
  await expectResult("multishot 6x2=12 ok", { shots: Array.from({ length: 6 }, () => ({ duration: 2 })) }, kling, true);
  await expectResult("multishot 6x3=18 -> 400", { shots: Array.from({ length: 6 }, () => ({ duration: 3 })) }, kling, false, "15s");
  await expectResult("sem shots ok", { resolution: "720p", duration: 5 }, kling, true);

  // ── Regressão: regras pré-existentes continuam ativas ─────────────────────
  await expectResult("duração fora do intervalo -> 400", { duration: 99 }, hailuo, false, "intervalo");
  await expectResult("URL de referência inválida -> 400", { reference_images: ["ftp://x"] }, kling, false, "http");

  return failures;
}

void runVideoValidationTests().then((failures) => {
  if (failures.length > 0) {
    const msg = `generation-validation.test falhou:\n - ${failures.join("\n - ")}`;
    console.error(msg);
    process.exitCode = 1;
    throw new Error(msg);
  } else {
    console.log("generation-validation.test: OK (todas as assertivas passaram)");
  }
});
});
