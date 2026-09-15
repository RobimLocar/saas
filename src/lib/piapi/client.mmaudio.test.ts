// P5h — MMAudio real (Qubico/mmaudio, video2audio) no client REAL: generateAudio
// (payload) + extractResultUrls (output.audio_url → scalar). Runner-agnóstico:
// fetch stubado, sem API real.
//
// Contrato oficial (mmaudio-api create-task): model=Qubico/mmaudio,
// task_type=video2audio, input{video, prompt, negative_prompt, steps, seed}.
// P5h envia só video+prompt(+negative_prompt); steps/seed NÃO enviados (DOC INCOMPLETE).
// Output oficial do produto: output.audio_url (single).

import { generateAudio, extractResultUrls } from "./client";
import { test } from "vitest";

test("client.mmaudio.test.ts", async () => {

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

  // ── PAYLOAD: video + prompt (sem negative_prompt) ───────────────────────────
  {
    const body = await submit({ model: "Qubico/mmaudio", prompt: "rain on a tin roof", video: "https://pub/v.mp4" });
    chk("mm: model", body.model === "Qubico/mmaudio");
    chk("mm: task_type video2audio", body.task_type === "video2audio");
    const input = body.input as Record<string, unknown>;
    chk("mm: input.video", input.video === "https://pub/v.mp4");
    chk("mm: input.prompt", input.prompt === "rain on a tin roof");
    chk("mm: sem negative_prompt (ausente)", !("negative_prompt" in input));
    chk("mm: sem steps", !("steps" in input));
    chk("mm: sem seed", !("seed" in input));
    chk("mm: input chaves exatas (video+prompt)", eq(Object.keys(input).sort(), ["prompt", "video"]));
  }

  // ── PAYLOAD: negative_prompt presente → propagado ───────────────────────────
  {
    const body = await submit({ model: "Qubico/mmaudio", prompt: "footsteps", video: "https://pub/v.mp4", negativePrompt: "music, speech" });
    const input = body.input as Record<string, unknown>;
    chk("mm-neg: negative_prompt", input.negative_prompt === "music, speech");
    chk("mm-neg: chaves exatas", eq(Object.keys(input).sort(), ["negative_prompt", "prompt", "video"]));
  }

  // ── RESULT: output.audio_url → scalar (extractor existente, sem mudança) ─────
  {
    const output = { audio_url: "https://mm/out.mp3" } as unknown as Parameters<typeof extractResultUrls>[0];
    const urls = extractResultUrls(output);
    chk("mm-result: 1 URL", urls.length === 1);
    chk("mm-result: audio_url", urls[0] === "https://mm/out.mp3");
  }

  // ── REGRESSÃO: outros branches intactos ─────────────────────────────────────
  {
    captured.length = 0;
    await generateAudio({ model: "kling", prompt: "x", duration: 5 });
    chk("regress: kling task_type sound", (captured[0]?.body as Record<string, unknown>)?.task_type === "sound");
    captured.length = 0;
    await generateAudio({ model: "music-u", prompt: "x", lyricsType: "instrumental" });
    chk("regress: music-u generate_music", (captured[0]?.body as Record<string, unknown>)?.task_type === "generate_music");
  }

  if (fails.length > 0) throw new Error("client.mmaudio.test falhou: " + fails.join(", "));
  console.log("client.mmaudio.test: OK (todas as assertivas passaram)");
});
