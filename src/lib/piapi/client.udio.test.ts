// P5e — Teste do BRANCH music-u de generateAudio (client.ts REAL). Prova o
// mapeamento args → payload PiAPI oficial (input.lyrics_type / lyrics /
// negative_tags / seed) dos 3 modos Udio, o back-compat legado e que ACE-Step
// permanece inalterado. Runner-agnóstico: NÃO chama API real — global.fetch é
// substituído por um stub que captura o body e devolve uma task fake.
//
// Contrato oficial confirmado (piapi.ai/docs/music-api):
//   generate     → { gpt_description_prompt, lyrics_type:"generate", (seed/neg opc) }
//   instrumental → { gpt_description_prompt, lyrics_type:"instrumental", ... }
//   user         → { lyrics, gpt_description_prompt, lyrics_type:"user", ... }

import { generateAudio } from "./client";
import { test } from "vitest";

test("client.udio.test.ts", async () => {

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
const fails: string[] = [];
const chk = (n: string, c: boolean): void => {
  if (!c) fails.push(n);
};

function fakeJsonResponse(obj: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "content-type" ? "application/json" : null,
    },
    text: async () => JSON.stringify(obj),
  } as unknown as Response;
}

// Stub de rede + chave (piapiFetch lê process.env.PIAPI_API_KEY em call-time).
process.env.PIAPI_API_KEY = process.env.PIAPI_API_KEY || "test-key";
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const bodyStr = typeof init?.body === "string" ? init.body : "{}";
  captured.push({ url: String(url), body: JSON.parse(bodyStr) });
  return fakeJsonResponse({ code: 200, data: { task_id: "task-1", status: "pending" } });
}) as unknown as typeof fetch;

// Helper: roda uma chamada e devolve o input do payload capturado.
async function run(params: Parameters<typeof generateAudio>[0]): Promise<Record<string, unknown>> {
  captured.length = 0;
  await generateAudio(params);
  const body = captured[0]?.body ?? {};
  return (body.input as Record<string, unknown>) ?? {};
}

  // ── AI Vocals (lyrics_type "generate") ──────────────────────────────────────
  {
    captured.length = 0;
    const input = await run({ model: "music-u", prompt: "night breeze, piano", lyricsType: "generate" });
    const body = captured[0]?.body ?? {};
    chk("generate: model music-u", body.model === "music-u");
    chk("generate: task_type generate_music", body.task_type === "generate_music");
    chk("generate: gpt_description_prompt", input.gpt_description_prompt === "night breeze, piano");
    chk("generate: lyrics_type", input.lyrics_type === "generate");
    chk("generate: sem lyrics", !("lyrics" in input));
    chk("generate: sem negative_tags", !("negative_tags" in input));
    chk("generate: sem seed", !("seed" in input));
    chk("generate: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics_type");
  }

  // ── Instrumental (lyrics_type "instrumental") ───────────────────────────────
  {
    const input = await run({ model: "music-u", prompt: "night breeze", lyricsType: "instrumental" });
    chk("instrumental: lyrics_type", input.lyrics_type === "instrumental");
    chk("instrumental: sem lyrics", !("lyrics" in input));
    chk("instrumental: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics_type");
  }

  // ── Custom Lyrics (lyrics_type "user" + lyrics) ─────────────────────────────
  {
    const lyricsText = "[Verse]\nletra do usuário\n[Chorus]";
    const input = await run({ model: "music-u", prompt: "jazz, pop", lyricsType: "user", lyrics: lyricsText });
    chk("user: lyrics_type", input.lyrics_type === "user");
    chk("user: lyrics presente e igual", input.lyrics === lyricsText);
    chk("user: gpt_description_prompt", input.gpt_description_prompt === "jazz, pop");
    chk("user: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics,lyrics_type");
  }

  // ── Custom sem lyrics: user mode mas lyrics ausente → omite lyrics ───────────
  {
    const input = await run({ model: "music-u", prompt: "jazz", lyricsType: "user" });
    chk("user-sem-lyrics: lyrics_type user", input.lyrics_type === "user");
    chk("user-sem-lyrics: sem lyrics", !("lyrics" in input));
    chk("user-sem-lyrics: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics_type");
  }

  // ── Avançado: negative_tags + seed ──────────────────────────────────────────
  {
    const input = await run({ model: "music-u", prompt: "night breeze", lyricsType: "instrumental", negativeTags: "distorted, low quality", seed: 42 });
    chk("adv: negative_tags", input.negative_tags === "distorted, low quality");
    chk("adv: seed", input.seed === 42);
    chk("adv: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics_type,negative_tags,seed");
  }

  // ── Back-compat 1: sem lyricsType, com lyrics → "user" + lyrics ─────────────
  {
    const input = await run({ model: "music-u", prompt: "desc", lyrics: "abc" });
    chk("legacy-lyrics: lyrics_type user", input.lyrics_type === "user");
    chk("legacy-lyrics: lyrics presente", input.lyrics === "abc");
    chk("legacy-lyrics: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics,lyrics_type");
  }

  // ── Back-compat 2: sem lyricsType, sem lyrics → "instrumental" ──────────────
  {
    const input = await run({ model: "music-u", prompt: "desc" });
    chk("legacy-default: lyrics_type instrumental", input.lyrics_type === "instrumental");
    chk("legacy-default: sem lyrics", !("lyrics" in input));
    chk("legacy-default: chaves exatas", Object.keys(input).sort().join(",") === "gpt_description_prompt,lyrics_type");
  }

  // ── ACE-Step INALTERADO (txt2audio + style_prompt + lyrics + infer_step) ────
  {
    const input = await run({ model: "Qubico/ace-step", prompt: "style", lyrics: "L", quality: "high" });
    const body = captured[0]?.body ?? {};
    chk("ace: task_type txt2audio", body.task_type === "txt2audio");
    chk("ace: style_prompt", input.style_prompt === "style");
    chk("ace: lyrics", input.lyrics === "L");
    chk("ace: infer_step high=100", input.infer_step === 100);
    chk("ace: sem lyrics_type (não é music-u)", !("lyrics_type" in input));
  }

  if (fails.length > 0) {
    throw new Error("client.udio.test falhou: " + fails.join(", "));
  }
  console.log("client.udio.test: OK (todas as assertivas passaram)");
});
