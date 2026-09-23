// P5g — Testes do Kling Sound SFX no client REAL (generateAudio submit +
// extractResultUrls). Runner-agnóstico: fetch stubado, sem API real.
//
// Contrato oficial (kling-sound-api): model=kling, task_type=sound,
// input{prompt,duration(5|10)}; 4 saídas em output.works[*].audio.
// URL policy: resource_without_watermark → fallback resource → ignora vazio.

import { generateAudio, extractResultUrls } from "./client";
import { test } from "vitest";

test("client.kling-sound.test.ts", async () => {

interface Captured { body: Record<string, unknown> }
const captured: Captured[] = [];
const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function fakeJson(obj: unknown): Response {
  return {
    ok: true, status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/json" : null) },
    text: async () => JSON.stringify(obj),
  } as unknown as Response;
}
process.env.PIAPI_API_KEY = process.env.PIAPI_API_KEY || "test-key";
globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
  captured.push({ body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") });
  return fakeJson({ code: 200, data: { task_id: "task-1", status: "pending" } });
}) as unknown as typeof fetch;

async function submit(params: Parameters<typeof generateAudio>[0]): Promise<Record<string, unknown>> {
  captured.length = 0;
  await generateAudio(params);
  return captured[0]?.body ?? {};
}

// Fixture de output Kling (works[].audio). clean = sem watermark.
const work = (clean: string, res: string) => ({
  content_type: "audio",
  audio: { resource: res, resource_without_watermark: clean },
  cover: { resource: "https://kling/cover.png" },
});

  // ── SUBMIT duration 5 ───────────────────────────────────────────────────────
  {
    const body = await submit({ model: "kling", prompt: "footsteps on gravel", duration: 5 });
    chk("dur5: model kling", body.model === "kling");
    chk("dur5: task_type sound", body.task_type === "sound");
    const input = body.input as Record<string, unknown>;
    chk("dur5: input.prompt", input.prompt === "footsteps on gravel");
    chk("dur5: input.duration 5", input.duration === 5);
    chk("dur5: input chaves exatas (só prompt+duration)", eq(Object.keys(input).sort(), ["duration", "prompt"]));
  }
  // ── SUBMIT duration 10 ──────────────────────────────────────────────────────
  {
    const body = await submit({ model: "kling", prompt: "rain", duration: 10 });
    const input = body.input as Record<string, unknown>;
    chk("dur10: duration 10", input.duration === 10);
    chk("dur10: sem lyrics/negative/seed/style", !("lyrics" in input) && !("negative_prompt" in input) && !("seed" in input) && !("style_prompt" in input) && !("lyrics_type" in input));
  }

  // ── EXTRACTION: 4 works, todos com clean → 4 URLs sem watermark ─────────────
  {
    const output = { type: "kwave_txt2audio", works: [
      work("https://clean/1.mp3", "https://wm/1.mp3"),
      work("https://clean/2.mp3", "https://wm/2.mp3"),
      work("https://clean/3.mp3", "https://wm/3.mp3"),
      work("https://clean/4.mp3", "https://wm/4.mp3"),
    ] } as unknown as Parameters<typeof extractResultUrls>[0];
    const urls = extractResultUrls(output);
    chk("extract4: 4 URLs", urls.length === 4);
    chk("extract4: todas sem watermark", eq(urls, ["https://clean/1.mp3", "https://clean/2.mp3", "https://clean/3.mp3", "https://clean/4.mp3"]));
    chk("extract4: primary = urls[0]", urls[0] === "https://clean/1.mp3");
  }

  // ── EXTRACTION fallback: w1 clean, w2 só resource, w3 ambos, w4 ambos vazios ─
  {
    const output = { works: [
      work("https://clean/a.mp3", "https://wm/a.mp3"),   // usa clean
      { audio: { resource: "https://wm/b.mp3", resource_without_watermark: "" } }, // fallback resource
      work("https://clean/c.mp3", "https://wm/c.mp3"),   // usa clean
      { audio: { resource: "", resource_without_watermark: "" } }, // omitido
    ] } as unknown as Parameters<typeof extractResultUrls>[0];
    const urls = extractResultUrls(output);
    chk("fallback: 3 URLs (w4 omitido)", urls.length === 3);
    chk("fallback: prefere clean onde existe; resource no w2", eq(urls, ["https://clean/a.mp3", "https://wm/b.mp3", "https://clean/c.mp3"]));
    chk("fallback: sem strings vazias", urls.every((u) => u.length > 0));
  }

  // ── EXTRACTION: não força 4 — 3 works válidos → 3 ────────────────────────────
  {
    const output = { works: [
      work("https://clean/x.mp3", "https://wm/x.mp3"),
      work("https://clean/y.mp3", "https://wm/y.mp3"),
      work("https://clean/z.mp3", "https://wm/z.mp3"),
    ] } as unknown as Parameters<typeof extractResultUrls>[0];
    chk("no-force-4: 3 URLs", extractResultUrls(output).length === 3);
  }

  // ── REGRESSÃO: Udio (songs[]) e ACE (audio_url) continuam single via fallback ─
  {
    const udio = { songs: [{ song_path: "https://udio/song.mp3" }] } as unknown as Parameters<typeof extractResultUrls>[0];
    chk("udio: single via extractResultUrl", eq(extractResultUrls(udio), ["https://udio/song.mp3"]));
    const ace = { audio_url: "https://ace/out.mp3" } as unknown as Parameters<typeof extractResultUrls>[0];
    chk("ace: single via extractResultUrl", eq(extractResultUrls(ace), ["https://ace/out.mp3"]));
  }

  if (fails.length > 0) throw new Error("client.kling-sound.test falhou: " + fails.join(", "));
  console.log("client.kling-sound.test: OK (todas as assertivas passaram)");
});
