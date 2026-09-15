// P11a — Testes do TRANSPORTE Atlas (mock de fetch; ZERO chamadas reais).
// Provam: endpoints genéricos image/video/audio, normalização de predição
// (media/text/failed), TTS ElevenLabs ainda verde, dispatch por profile (dois
// modelos mesmo profile sem mudar código), rejeição de campo arbitrário e LLM base URL.

import { test } from "vitest";

test("transport.test.ts", async () => {

process.env.ATLAS_API_KEY = "test-key";

const client = await import("./client");
const dispatch = await import("./dispatch");
const llm = await import("./llm");

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

type Call = { url: string; opts: { method?: string; headers?: Record<string, string>; body?: string } };
let calls: Call[] = [];

// Instala um stub de fetch que responde conforme a URL; captura chamadas.
function installFetch(responder: (url: string, opts: Call["opts"]) => { status?: number; json: unknown }) {
  calls = [];
  // @ts-expect-error test stub
  globalThis.fetch = async (url: unknown, opts: unknown) => {
    const o = (opts as Call["opts"]) || {};
    calls.push({ url: String(url), opts: o });
    const r = responder(String(url), o);
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      text: async () => JSON.stringify(r.json),
      json: async () => r.json,
      headers: { get: () => "application/json" },
    };
  };
}

const bodyOf = (i = 0) => JSON.parse(calls[i].opts.body || "{}");
const auth = (i = 0) => calls[i].opts.headers?.["Authorization"];

// ── 1) submit genérico → endpoint correto + auth + pollRef ────────────────────
installFetch((url) =>
  url.includes("/generateImage")
    ? { json: { code: 200, data: { id: "pred1", status: "processing" } } }
    : { json: { code: 200, data: { id: "predX", status: "processing" } } }
);
{
  const r = await client.submitAtlasImage({ model: "m", prompt: "x" });
  check("submitAtlasImage endpoint", calls[0].url.includes("/api/v1/model/generateImage"));
  check("submitAtlasImage auth bearer", auth(0) === "Bearer test-key");
  check("submitAtlasImage pollRef+id", r.ok === true && r.predictionId === "pred1" && !!r.pollRef);
}
{
  await client.submitAtlasVideo({ model: "m", prompt: "x" });
  check("submitAtlasVideo endpoint", calls[calls.length - 1].url.includes("/generateVideo"));
}

// ── 2) prediction normalization ───────────────────────────────────────────────
installFetch(() => ({ json: { code: 200, data: { status: "completed", outputs: ["https://cdn/x.png"] } } }));
{
  const p = await client.getAtlasPrediction("pred1");
  check("prediction completed media", p.status === "completed" && p.outputs[0] === "https://cdn/x.png");
}
installFetch(() => ({ json: { code: 200, data: { status: "completed", outputs: ["texto reconhecido"] } } }));
{
  const p = await client.getAtlasPrediction("pred1");
  check("prediction text output (string cru)", p.status === "completed" && p.outputs[0] === "texto reconhecido");
}
installFetch(() => ({ json: { code: 200, data: { status: "failed", error: "boom" } } }));
{
  const p = await client.getAtlasPrediction("pred1");
  check("prediction failed", p.status === "failed" && p.error === "boom");
}

// ── 3) TTS ElevenLabs ainda verde (output imediato → sem polling) ─────────────
installFetch((url) =>
  url.includes("/generateAudio")
    ? { json: { code: 200, data: { status: "completed", outputs: ["https://cdn/voice.mp3"] } } }
    : { json: { code: 200, data: {} } }
);
{
  const urlOut = await client.generateSpeechAtlas({ text: "olá", voice: "v1" });
  check("TTS retorna URL", urlOut === "https://cdn/voice.mp3");
  check("TTS chama generateAudio", calls[0].url.includes("/generateAudio"));
  check("TTS body model default", bodyOf(0).model === "elevenlabs/v3/text-to-speech");
}

// ── 4) dispatch: dois modelos MESMO profile, sem mudar código ─────────────────
installFetch(() => ({ json: { code: 200, data: { id: "p", status: "processing" } } }));
{
  const a = await dispatch.submitAtlasGeneration({ contractId: "image-basic", atlasModel: "seedream-x", input: { prompt: "gato", aspect_ratio: "9:16", evil: "DROP" } });
  check("dispatch A ok", a.ok === true);
  check("dispatch A endpoint generateImage", calls[calls.length - 1].url.includes("/generateImage"));
  check("dispatch A body model", bodyOf(calls.length - 1).model === "seedream-x");
  check("dispatch A ARBITRARY field NÃO vai ao provider", !("evil" in bodyOf(calls.length - 1)));

  const b = await dispatch.submitAtlasGeneration({ contractId: "image-basic", atlasModel: "recraft-y", input: { prompt: "gato", aspect_ratio: "9:16" } });
  check("dispatch B ok mesmo profile", b.ok === true);
  check("dispatch B só troca o model", bodyOf(calls.length - 1).model === "recraft-y");
}
// ── 5) dispatch: contrato desconhecido / input inválido → sem fetch ───────────
{
  const before = calls.length;
  const bad = await dispatch.submitAtlasGeneration({ contractId: "nope", atlasModel: "m", input: {} });
  check("dispatch contrato desconhecido → erro", bad.ok === false);
  check("dispatch contrato desconhecido → NENHUM fetch", calls.length === before);
  const bad2 = await dispatch.submitAtlasGeneration({ contractId: "image-edit", atlasModel: "m", input: { prompt: "x" } });
  check("dispatch input inválido (sem image_urls) → erro", bad2.ok === false);
  check("dispatch input inválido → NENHUM fetch", calls.length === before);
}

// ── 6) LLM OpenAI-compatible: base URL Atlas + auth + content ─────────────────
installFetch(() => ({ json: { choices: [{ message: { content: "resposta" } }] } }));
{
  const r = await llm.atlasChatCompletion({ model: "deepseek-x", messages: [{ role: "user", content: "oi" }], apiKey: "k2" });
  check("LLM base URL Atlas", calls[calls.length - 1].url === `${llm.ATLAS_LLM_BASE_URL}/chat/completions`);
  check("LLM auth bearer override", auth(calls.length - 1) === "Bearer k2");
  check("LLM body model", bodyOf(calls.length - 1).model === "deepseek-x");
  check("LLM content", r.ok === true && r.content === "resposta");
}

// ── 7) MODE-AWARE dispatch: modo troca o atlas_model CONFIÁVEL + contrato ─────
{
  const byMode = {
    "text-to-video": "vendor/x/text-to-video",
    "image-to-video": "vendor/x/image-to-video",
    "reference-to-video": "vendor/x/reference-to-video",
  };
  check("resolve mode → model", dispatch.resolveAtlasModelForMode("def", byMode, "image-to-video") === "vendor/x/image-to-video");
  check("resolve sem mode → default", dispatch.resolveAtlasModelForMode("def", byMode, undefined) === "def");
  check("resolve mode ausente no mapa → default", dispatch.resolveAtlasModelForMode("def", byMode, "video-edit") === "def");

  installFetch(() => ({ json: { code: 200, data: { id: "p", status: "processing" } } }));
  // text-to-video → video-basic (generateVideo) + model t2v.
  const t2v = await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "def", mode: "text-to-video", atlasModelsByMode: byMode,
    input: { prompt: "cena" },
  });
  check("t2v ok", t2v.ok === true);
  check("t2v model", bodyOf(calls.length - 1).model === "vendor/x/text-to-video");
  check("t2v endpoint generateVideo", calls[calls.length - 1].url.includes("/generateVideo"));

  // image-to-video → contrato vira video-image (exige image_url) + model i2v.
  const i2v = await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "def", mode: "image-to-video", atlasModelsByMode: byMode,
    input: { prompt: "cena", image_url: "https://a/x.png" },
  });
  check("i2v ok (video-image)", i2v.ok === true);
  check("i2v model", bodyOf(calls.length - 1).model === "vendor/x/image-to-video");
  check("i2v body tem image_url", bodyOf(calls.length - 1).image_url === "https://a/x.png");

  // i2v SEM image_url → contrato video-image rejeita (validação), sem fetch.
  const beforeN = calls.length;
  const i2vBad = await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "def", mode: "image-to-video", atlasModelsByMode: byMode,
    input: { prompt: "cena" },
  });
  check("i2v sem image_url → erro", i2vBad.ok === false);
  check("i2v sem image_url → sem fetch", calls.length === beforeN);

  // start-end-frame → contrato video-start-end (image_url start + end_image_url).
  installFetch(() => ({ json: { code: 200, data: { id: "p", status: "processing" } } }));
  const se = await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "def", mode: "start-end-frame",
    atlasModelsByMode: { "start-end-frame": "vendor/x/start-end" },
    input: { image_url: "https://a/s.png", end_image_url: "https://a/e.png", duration: 8 },
  });
  check("start-end ok", se.ok === true);
  check("start-end model + end_image", bodyOf(calls.length - 1).model === "vendor/x/start-end" && bodyOf(calls.length - 1).end_image_url === "https://a/e.png");

  // reference-to-video → contrato video-reference-images (refers[]; NÃO image_url).
  const ref = await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "def", mode: "reference-to-video",
    atlasModelsByMode: { "reference-to-video": "vendor/x/ref" },
    input: { refers: ["https://a/1.png", "https://a/2.png"], prompt: "cena" },
  });
  check("reference ok", ref.ok === true);
  check("reference usa refers[]", Array.isArray(bodyOf(calls.length - 1).refers) && (bodyOf(calls.length - 1).refers as string[]).length === 2);
  check("reference NÃO vira image_url", !("image_url" in bodyOf(calls.length - 1)));

  // reference sem refers → erro (validação do profile), sem fetch.
  const nrefs = calls.length;
  const refBad = await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "def", mode: "reference-to-video",
    atlasModelsByMode: { "reference-to-video": "vendor/x/ref" },
    input: { prompt: "cena" },
  });
  check("reference sem refers → erro", refBad.ok === false);
  check("reference sem refers → sem fetch", calls.length === nrefs);
}

// ── 8) EXACT PAYLOAD (COMPETITOR-VIDEO-04): transform por modelo → contrato real ─
{
  installFetch(() => ({ json: { code: 200, data: { id: "p", status: "processing" } } }));

  // Veo Lite start-end: image_url→image, end_image_url→last_image.
  await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "veo", mode: "start-end-frame",
    atlasModelsByMode: { "start-end-frame": "google/veo3.1-lite/start-end-frame-to-video" },
    transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } },
    input: { image_url: "https://a/s.png", end_image_url: "https://a/e.png", duration: 8 },
  });
  {
    const b = bodyOf(calls.length - 1);
    check("Veo start-end body {image,last_image}", b.image === "https://a/s.png" && b.last_image === "https://a/e.png" && !("image_url" in b) && !("end_image_url" in b));
  }

  // Seedance 1.5 image: image_url→image.
  await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "sd", mode: "image-to-video",
    atlasModelsByMode: { "image-to-video": "bytedance/seedance-v1.5-pro/image-to-video" },
    transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } },
    input: { image_url: "https://a/s.png" },
  });
  check("Seedance1.5 image body {image}", bodyOf(calls.length - 1).image === "https://a/s.png" && !("image_url" in bodyOf(calls.length - 1)));

  // MiniMax H3 reference: refers:[{url}].
  await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "h3", mode: "reference-to-video",
    atlasModelsByMode: { "reference-to-video": "minimax/h3/reference-to-video" },
    transform: { refersAsObjects: true },
    input: { refers: ["https://a/1.png", "https://a/2.png"], prompt: "x" },
  });
  {
    const refs = bodyOf(calls.length - 1).refers as Array<{ url: string }>;
    check("H3 reference refers:[{url}]", Array.isArray(refs) && refs[0].url === "https://a/1.png" && refs[1].url === "https://a/2.png");
  }

  // Grok reference: image_urls[] (NÃO refers).
  await dispatch.submitAtlasGeneration({
    contractId: "video-basic", atlasModel: "grok", mode: "reference-to-video",
    atlasModelsByMode: { "reference-to-video": "xai/grok-imagine-video-v1.5/reference-to-video" },
    transform: { refersField: "image_urls" },
    input: { refers: ["https://a/1.png", "https://a/2.png"], prompt: "x" },
  });
  {
    const b = bodyOf(calls.length - 1);
    check("Grok reference image_urls[]", Array.isArray(b.image_urls) && (b.image_urls as string[])[0] === "https://a/1.png" && !("refers" in b));
  }
}

if (failures.length > 0) throw new Error(`atlas/transport.test falhou:\n - ${failures.join("\n - ")}`);
else console.log("atlas/transport.test: OK");
});
