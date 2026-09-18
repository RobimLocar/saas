// P5f — Teste do BRANCH ace-step de generateAudio (client.ts REAL). Prova o
// payload PiAPI oficial ACE-Step (txt2audio): style_prompt, lyrics, negative_prompt,
// e o comportamento INTERNO infer_step (não-oficial, preservado). Runner-agnóstico:
// NÃO chama API real — global.fetch é substituído por um stub que captura o body.
//
// Contrato oficial confirmado (piapi.ai/docs/ace-step-api/text-to-audio):
//   model="Qubico/ace-step", task_type="txt2audio",
//   input: { style_prompt, negative_prompt, lyrics, duration }, instrumental="[inst]".

import { generateAudio } from "./client";
import { test } from "vitest";

test("client.ace.test.ts", async () => {

interface Captured { url: string; body: Record<string, unknown> }
const captured: Captured[] = [];
const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };

function fakeJsonResponse(obj: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/json" : null) },
    text: async () => JSON.stringify(obj),
  } as unknown as Response;
}

process.env.PIAPI_API_KEY = process.env.PIAPI_API_KEY || "test-key";
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const bodyStr = typeof init?.body === "string" ? init.body : "{}";
  captured.push({ url: String(url), body: JSON.parse(bodyStr) });
  return fakeJsonResponse({ code: 200, data: { task_id: "task-1", status: "pending" } });
}) as unknown as typeof fetch;

async function run(params: Parameters<typeof generateAudio>[0]): Promise<Record<string, unknown>> {
  captured.length = 0;
  await generateAudio(params);
  const body = captured[0]?.body ?? {};
  return (body.input as Record<string, unknown>) ?? {};
}

  // ── Legacy direct: sem lyrics → lyrics:"" preservado (só a route chama este
  //    client; fallback mantido por segurança). infer_step interno = 100 (high). ─
  {
    captured.length = 0;
    const input = await run({ model: "Qubico/ace-step", prompt: "guitar and piano", quality: "high" });
    const body = captured[0]?.body ?? {};
    chk("legacy: model", body.model === "Qubico/ace-step");
    chk("legacy: task_type txt2audio", body.task_type === "txt2audio");
    chk("legacy: style_prompt", input.style_prompt === "guitar and piano");
    chk("legacy: lyrics vazio preservado", input.lyrics === "");
    chk("legacy: infer_step 100 (INTERNAL/high)", input.infer_step === 100);
    chk("legacy: sem negative_prompt", !("negative_prompt" in input));
    chk("legacy: chaves exatas", Object.keys(input).sort().join(",") === "infer_step,lyrics,style_prompt");
  }

  // ── Instrumental route-style: lyrics:"[inst]" ───────────────────────────────
  {
    const input = await run({ model: "Qubico/ace-step", prompt: "guitar", lyrics: "[inst]", quality: "high" });
    chk("inst: lyrics [inst]", input.lyrics === "[inst]");
    chk("inst: chaves exatas", Object.keys(input).sort().join(",") === "infer_step,lyrics,style_prompt");
  }

  // ── With Lyrics: texto exato do usuário (line breaks + tags preservados) ─────
  {
    const lyricsText = "[verse]\nSunshine on the boulevard\n[chorus]\nWe ride";
    const input = await run({ model: "Qubico/ace-step", prompt: "pop", lyrics: lyricsText, quality: "high" });
    chk("lyrics: exato", input.lyrics === lyricsText);
    chk("lyrics: style_prompt", input.style_prompt === "pop");
  }

  // ── Negative Prompt propagado quando presente ───────────────────────────────
  {
    const input = await run({ model: "Qubico/ace-step", prompt: "guitar", lyrics: "[inst]", negativePrompt: "noise", quality: "high" });
    chk("neg: negative_prompt", input.negative_prompt === "noise");
    chk("neg: chaves exatas", Object.keys(input).sort().join(",") === "infer_step,lyrics,negative_prompt,style_prompt");
  }

  // ── infer_step INTERNO por quality (não-oficial; comportamento atual) ────────
  {
    const low = await run({ model: "Qubico/ace-step", prompt: "x", lyrics: "[inst]", quality: "low" });
    const med = await run({ model: "Qubico/ace-step", prompt: "x", lyrics: "[inst]", quality: "medium" });
    chk("infer_step: low=30 (INTERNAL)", low.infer_step === 30);
    chk("infer_step: medium=60 (INTERNAL)", med.infer_step === 60);
  }

  // ── Udio SEM regressão: music-u continua generate_music ─────────────────────
  {
    captured.length = 0;
    await generateAudio({ model: "music-u", prompt: "desc", lyricsType: "instrumental" });
    const body = captured[0]?.body ?? {};
    chk("udio-nao-regride: task_type generate_music", body.task_type === "generate_music");
  }

  if (fails.length > 0) {
    throw new Error("client.ace.test falhou: " + fails.join(", "));
  }
  console.log("client.ace.test: OK (todas as assertivas passaram)");
});
