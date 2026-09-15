// FLUXYRA-AI-ROUTE-CERTIFICATION-01 — certifica o CAMINHO real de payload por
// model+mode (exact model id + exact provider body) e rejeição de forjas. Usa o
// código REAL: resolveAtlasModelForMode + videoContractForMode + profile.buildBody +
// applyAtlasFieldMap. Sem rede. Espelha exatamente o que a rota /api/generate/video monta.
import { resolveAtlasModelForMode, applyAtlasFieldMap, videoContractForMode, type AtlasFieldTransform } from "@/lib/atlas/dispatch";
import { getAtlasContract } from "@/lib/atlas/profiles";
import { test } from "vitest";

test("route-certification.test.ts", async () => {

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

// Reconstrói o body EXATO do provider (igual à rota): resolve model por modo →
// escolhe contrato do modo → buildBody canônico → applyAtlasFieldMap por modelo.
function build(opts: {
  atlasModel: string; byMode: Record<string, string>; mode: string; contractDefault: string;
  input: Record<string, unknown>; transform?: AtlasFieldTransform;
}): { model: string; body: Record<string, unknown> } | { error: string } {
  const model = resolveAtlasModelForMode(opts.atlasModel, opts.byMode, opts.mode)!;
  const contractId = videoContractForMode(opts.mode) ?? opts.contractDefault;
  const profile = getAtlasContract(contractId)!;
  const built = profile.buildBody(model, opts.input);
  if (!built.ok) return { error: built.error };
  const body = opts.transform ? applyAtlasFieldMap(built.body, opts.transform) : built.body;
  return { model, body };
}

const URL1 = "https://cdn/a.jpg", URL2 = "https://cdn/b.jpg";

function run() {
  // ── GROK T2V: model exato, body {model,prompt,aspect_ratio,duration,resolution}, SEM refers/image ──
  const grokBy = {
    "text-to-video": "xai/grok-imagine-video-v1.5/text-to-video",
    "image-to-video": "xai/grok-imagine-video-v1.5/image-to-video",
    "reference-to-video": "xai/grok-imagine-video-v1.5/reference-to-video",
  };
  const grokT = build({ atlasModel: grokBy["text-to-video"], byMode: grokBy, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "cat", aspect_ratio: "16:9", duration: 5, resolution: "1080p" } });
  check("Grok T2V model exato", "body" in grokT && grokT.model === "xai/grok-imagine-video-v1.5/text-to-video");
  check("Grok T2V body correto + sem refers/image_url", "body" in grokT && grokT.body.prompt === "cat" && grokT.body.aspect_ratio === "16:9" && grokT.body.duration === 5 && grokT.body.resolution === "1080p" && !("refers" in grokT.body) && !("image_url" in grokT.body) && !("image_urls" in grokT.body));

  // ── FORGERY: Grok Text + refers[] → refers IGNORADO (não vai ao provider) ──
  const grokForge = build({ atlasModel: grokBy["text-to-video"], byMode: grokBy, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "x", refers: [URL1, URL2] } });
  check("FORGERY Grok Text + refers → ignorado", "body" in grokForge && !("refers" in grokForge.body) && !("image_urls" in grokForge.body));

  // ── GROK I2V: field image_url ──
  const grokI = build({ atlasModel: grokBy["image-to-video"], byMode: grokBy, mode: "image-to-video", contractDefault: "video-basic",
    input: { prompt: "x", image_url: URL1 } });
  check("Grok I2V model+image_url", "body" in grokI && grokI.model.endsWith("/image-to-video") && grokI.body.image_url === URL1);

  // ── GROK REFERENCE: image_urls[] (NÃO refers) ──
  const grokRef = build({ atlasModel: grokBy["reference-to-video"], byMode: grokBy, mode: "reference-to-video", contractDefault: "video-basic",
    input: { prompt: "x", refers: [URL1, URL2] }, transform: { refersField: "image_urls" } });
  check("Grok Reference → image_urls[], sem refers", "body" in grokRef && Array.isArray((grokRef.body as { image_urls?: unknown[] }).image_urls) && !("refers" in grokRef.body) && grokRef.model.endsWith("/reference-to-video"));

  // ── H3 I2V: image (não image_url/last_image) ──
  const h3By = { "image-to-video": "minimax/h3/image-to-video", "reference-to-video": "minimax/h3/reference-to-video" };
  const h3I = build({ atlasModel: h3By["image-to-video"], byMode: h3By, mode: "image-to-video", contractDefault: "video-basic",
    input: { prompt: "x", image_url: URL1 }, transform: { fieldMap: { image_url: "image", end_image_url: "end_image" } } });
  check("H3 I2V → image (renomeado), sem image_url", "body" in h3I && h3I.body.image === URL1 && !("image_url" in h3I.body));

  // ── H3 REFERENCE: refers:[{url}] ──
  const h3Ref = build({ atlasModel: h3By["reference-to-video"], byMode: h3By, mode: "reference-to-video", contractDefault: "video-basic",
    input: { prompt: "x", refers: [URL1] }, transform: { refersAsObjects: true } });
  check("H3 Reference → refers:[{url}]", "body" in h3Ref && Array.isArray(h3Ref.body.refers) && (h3Ref.body.refers as Array<{ url: string }>)[0].url === URL1);

  // ── VEO START-END: image + last_image ──
  const veoBy = {
    "text-to-video": "google/veo3.1-lite/text-to-video",
    "start-end-frame": "google/veo3.1-lite/start-end-frame-to-video",
  };
  const veoSE = build({ atlasModel: veoBy["start-end-frame"], byMode: veoBy, mode: "start-end-frame", contractDefault: "video-basic",
    input: { prompt: "x", image_url: URL1, end_image_url: URL2 }, transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } } });
  check("Veo Start-End → image + last_image", "body" in veoSE && veoSE.body.image === URL1 && veoSE.body.last_image === URL2 && !("image_url" in veoSE.body) && !("end_image_url" in veoSE.body));

  // ── FORGERY: Veo Text + last_image/end_image_url → ignorado ──
  const veoForge = build({ atlasModel: veoBy["text-to-video"], byMode: veoBy, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "x", end_image_url: URL2 }, transform: { fieldMap: { end_image_url: "last_image" } } });
  check("FORGERY Veo Text + end_image → ignorado", "body" in veoForge && !("last_image" in veoForge.body) && !("end_image_url" in veoForge.body));

  // ── SEEDANCE 1.5 I2V: image ──
  const seedI = build({ atlasModel: "bytedance/seedance-v1.5-pro/image-to-video", byMode: { "image-to-video": "bytedance/seedance-v1.5-pro/image-to-video" }, mode: "image-to-video", contractDefault: "video-basic",
    input: { image_url: URL1 }, transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } } });
  check("Seedance I2V → image", "body" in seedI && seedI.body.image === URL1);

  // ── KLING TURBO I2V: image_url (sem field map), model exato ──
  const turboI = build({ atlasModel: "kwaivgi/kling-v3.0-turbo/image-to-video", byMode: { "image-to-video": "kwaivgi/kling-v3.0-turbo/image-to-video" }, mode: "image-to-video", contractDefault: "video-basic",
    input: { image_url: URL1 } });
  check("Kling Turbo I2V model+image_url", "body" in turboI && turboI.model === "kwaivgi/kling-v3.0-turbo/image-to-video" && turboI.body.image_url === URL1);

  // ── ADVANCED FIELDS: Seedance I2V com generate_audio/camera_fixed/seed ──
  const seedAdv = build({ atlasModel: "bytedance/seedance-v1.5-pro/image-to-video", byMode: { "image-to-video": "bytedance/seedance-v1.5-pro/image-to-video" }, mode: "image-to-video", contractDefault: "video-basic",
    input: { image_url: URL1, generate_audio: false, camera_fixed: true, seed: 42 }, transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } } });
  check("Seedance I2V advanced → generate_audio/camera_fixed/seed no body", "body" in seedAdv && seedAdv.body.generate_audio === false && seedAdv.body.camera_fixed === true && seedAdv.body.seed === 42 && seedAdv.body.image === URL1);

  // ── ADVANCED: Grok Reference com voice_ids ≤3 → body.voice_ids, sem refers ──
  const grokVoice = build({ atlasModel: grokBy["reference-to-video"], byMode: grokBy, mode: "reference-to-video", contractDefault: "video-basic",
    input: { prompt: "x", refers: [URL1], voice_ids: ["v1", "v2"] }, transform: { refersField: "image_urls" } });
  check("Grok Reference voice_ids no body + image_urls, sem refers", "body" in grokVoice && Array.isArray((grokVoice.body as { voice_ids?: unknown[] }).voice_ids) && "image_urls" in grokVoice.body && !("refers" in grokVoice.body));

  // ── VALIDATION: voice_ids > 3 → erro; seed não-inteiro → erro ──
  const badVoice = build({ atlasModel: grokBy["reference-to-video"], byMode: grokBy, mode: "reference-to-video", contractDefault: "video-basic",
    input: { refers: [URL1], voice_ids: ["a", "b", "c", "d"] }, transform: { refersField: "image_urls" } });
  check("voice_ids > 3 → erro", "error" in badVoice);
  const badSeed = build({ atlasModel: "m/x/text-to-video", byMode: { "text-to-video": "m/x/text-to-video" }, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "x", seed: "not-int" } });
  check("seed não-inteiro → erro", "error" in badSeed);

  // §2 — field map I2V dos Kling 4K/O3 (do catálogo payload_field_map).
  const KLING_I2V_MAP: AtlasFieldTransform = { fieldMap: { image_url: "image", end_image_url: "end_image" } };

  // ── KLING 3.0 4K I2V: model exato; BODY FINAL usa `image`/`end_image` (NÃO image_url) ──
  const k4kI = build({ atlasModel: "kwaivgi/kling-v3.0-4k/image-to-video", byMode: { "image-to-video": "kwaivgi/kling-v3.0-4k/image-to-video" }, mode: "image-to-video", contractDefault: "video-image",
    input: { image_url: URL1, end_image_url: URL2, sound: true, cfg_scale: 0.5, negative_prompt: "blur", multi_shot: true, shot_type: "customize", multi_prompt: [{ prompt: "a", duration: 5 }, { prompt: "b", duration: 5 }] },
    transform: KLING_I2V_MAP });
  check("Kling 3.0 4K I2V model exato", "body" in k4kI && k4kI.model === "kwaivgi/kling-v3.0-4k/image-to-video");
  check("Kling 3.0 4K I2V final body: image set, image_url undefined", "body" in k4kI && k4kI.body.image === URL1 && k4kI.body.image_url === undefined);
  check("Kling 3.0 4K I2V final body: end_image set, end_image_url undefined", "body" in k4kI && k4kI.body.end_image === URL2 && k4kI.body.end_image_url === undefined);
  check("Kling 3.0 4K I2V campos avançados", "body" in k4kI && k4kI.body.sound === true && k4kI.body.cfg_scale === 0.5 && k4kI.body.multi_shot === true && k4kI.body.shot_type === "customize" && Array.isArray(k4kI.body.multi_prompt));

  // ── KLING O3 4K I2V: model exato; BODY FINAL `image`/`end_image` (NÃO image_url) ──
  const o3I = build({ atlasModel: "kwaivgi/kling-video-o3-4k/image-to-video", byMode: { "image-to-video": "kwaivgi/kling-video-o3-4k/image-to-video" }, mode: "image-to-video", contractDefault: "video-image",
    input: { image_url: URL1, end_image_url: URL2, sound: true }, transform: KLING_I2V_MAP });
  check("O3 4K I2V model exato (kling-video-o3-4k)", "body" in o3I && o3I.model === "kwaivgi/kling-video-o3-4k/image-to-video" && !o3I.model.includes("kling-o3/"));
  check("O3 4K I2V final body: image set, image_url undefined", "body" in o3I && o3I.body.image === URL1 && o3I.body.image_url === undefined);
  check("O3 4K I2V final body: end_image set", "body" in o3I && o3I.body.end_image === URL2 && o3I.body.end_image_url === undefined);

  // ── KLING O3 4K T2V: model exato + sound/multi_shot intelligence (sem multi_prompt manual) ──
  const o3T = build({ atlasModel: "kwaivgi/kling-video-o3-4k/text-to-video", byMode: { "text-to-video": "kwaivgi/kling-video-o3-4k/text-to-video" }, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "x", sound: true, multi_shot: true, shot_type: "intelligence" } });
  check("Kling O3 4K T2V model exato (kling-video-o3-4k)", "body" in o3T && o3T.model === "kwaivgi/kling-video-o3-4k/text-to-video" && o3T.body.sound === true && o3T.body.shot_type === "intelligence" && !o3T.model.includes("kling-o3/"));

  // ── §1/§15 — O3 4K reference-to-video NÃO EXISTE: resolver NÃO deve inventar endpoint,
  //    e NÃO pode cair em std/pro. Sem row no by-mode ⇒ resolve p/ default? Testamos que
  //    o by-mode do O3 4K só tem t2v/i2v (nenhum reference-to-video / kling-o3-std|pro). ──
  const o3ByMode = { "text-to-video": "kwaivgi/kling-video-o3-4k/text-to-video", "image-to-video": "kwaivgi/kling-video-o3-4k/image-to-video" } as Record<string, string>;
  check("O3 4K não tem reference-to-video no by-mode", o3ByMode["reference-to-video"] === undefined);
  check("O3 4K by-mode não usa std/pro impostor", !Object.values(o3ByMode).some((v) => v.includes("o3-std") || v.includes("o3-pro")));

  // ── §3 — TROCAR de modelo ALTERA o final provider body (image_url vs image/last_image) ──
  const grokI2 = build({ atlasModel: grokBy["image-to-video"], byMode: grokBy, mode: "image-to-video", contractDefault: "video-basic", input: { prompt: "x", image_url: URL1 } });
  const h3I2 = build({ atlasModel: h3By["image-to-video"], byMode: h3By, mode: "image-to-video", contractDefault: "video-basic", input: { prompt: "x", image_url: URL1, end_image_url: URL2 }, transform: { fieldMap: { image_url: "image", end_image_url: "end_image" } } });
  const veoI2 = build({ atlasModel: veoBy["start-end-frame"], byMode: veoBy, mode: "start-end-frame", contractDefault: "video-basic", input: { prompt: "x", image_url: URL1, end_image_url: URL2 }, transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } } });
  check("Grok I2V mantém image_url (sem field map)", "body" in grokI2 && grokI2.body.image_url === URL1 && grokI2.body.image === undefined);
  check("H3 I2V usa image/end_image", "body" in h3I2 && h3I2.body.image === URL1 && h3I2.body.end_image === URL2 && h3I2.body.image_url === undefined);
  check("Veo Start-End usa image/last_image", "body" in veoI2 && veoI2.body.image === URL1 && veoI2.body.last_image === URL2 && veoI2.body.image_url === undefined);
  check("Kling 4K ≠ Grok: mesmo image_url de entrada → bodies diferentes", "body" in k4kI && "body" in grokI2 && k4kI.body.image === URL1 && grokI2.body.image === undefined && grokI2.body.image_url === URL1);

  // ── FORGERY: campo arbitrário fora da allowlist é descartado ──
  const junk = build({ atlasModel: "kwaivgi/kling-v3.0-4k/text-to-video", byMode: { "text-to-video": "kwaivgi/kling-v3.0-4k/text-to-video" }, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "x", hack_field: "evil", __proto__: { x: 1 } } as Record<string, unknown> });
  check("FORGERY campo arbitrário descartado", "body" in junk && !("hack_field" in junk.body));

  // ── PRE-SMOKE §1 — SEEDANCE 1.5 PRO I2V: model exato + body final image/last_image ──
  const seedByMode = { "text-to-video": "bytedance/seedance-v1.5-pro/text-to-video", "image-to-video": "bytedance/seedance-v1.5-pro/image-to-video" };
  const seedI2 = build({ atlasModel: seedByMode["image-to-video"], byMode: seedByMode, mode: "image-to-video", contractDefault: "video-image",
    input: { image_url: URL1, end_image_url: URL2, generate_audio: true, camera_fixed: false, seed: 7 }, transform: { fieldMap: { image_url: "image", end_image_url: "last_image" } } });
  check("Seedance 1.5 I2V model exato", "body" in seedI2 && seedI2.model === "bytedance/seedance-v1.5-pro/image-to-video");
  check("Seedance 1.5 I2V body: image/last_image (não image_url)", "body" in seedI2 && seedI2.body.image === URL1 && seedI2.body.last_image === URL2 && seedI2.body.image_url === undefined && seedI2.body.end_image_url === undefined);
  check("Seedance 1.5 I2V advanced (generate_audio/camera_fixed/seed)", "body" in seedI2 && seedI2.body.generate_audio === true && seedI2.body.camera_fixed === false && seedI2.body.seed === 7);

  // ── GEMINI-STANDARD-CONTRACT-FIX-01 §1/§2/§6 — slug gemini-omni-flash, I2V=image, thinking_level ENUM ──
  const gemBy = { "text-to-video": "google/gemini-omni-flash/text-to-video", "image-to-video": "google/gemini-omni-flash/image-to-video" };
  const GEM_I2V_MAP: AtlasFieldTransform = { fieldMap: { image_url: "image" } };
  // T2V: prompt/duration/aspect/resolution 720p/thinking_level/seed — SEM image
  const gemT = build({ atlasModel: gemBy["text-to-video"], byMode: gemBy, mode: "text-to-video", contractDefault: "video-basic",
    input: { prompt: "x", seed: 5, thinking_level: "high", aspect_ratio: "16:9", resolution: "720p", duration: 6 } });
  check("Gemini STD T2V model exato (gemini-omni-flash)", "body" in gemT && gemT.model === "google/gemini-omni-flash/text-to-video" && !gemT.model.includes("gemini-omni-1.1-flash"));
  check("Gemini STD T2V body: seed+thinking_level+720, SEM image/image_url", "body" in gemT && gemT.body.seed === 5 && gemT.body.thinking_level === "high" && gemT.body.resolution === "720p" && gemT.body.image === undefined && gemT.body.image_url === undefined);
  // §1 — I2V: body final `image` (NÃO image_url); thinking_level enum "low"
  const gemI = build({ atlasModel: gemBy["image-to-video"], byMode: gemBy, mode: "image-to-video", contractDefault: "video-image",
    input: { image_url: URL1, prompt: "x", thinking_level: "low" }, transform: GEM_I2V_MAP });
  check("Gemini STD I2V model exato", "body" in gemI && gemI.model === "google/gemini-omni-flash/image-to-video");
  check("Gemini STD I2V final body: image set, image_url undefined", "body" in gemI && gemI.body.image === URL1 && gemI.body.image_url === undefined);
  check("Gemini STD I2V thinking_level enum", "body" in gemI && gemI.body.thinking_level === "low");
  check("Gemini NÃO usa slug obsoleto 1.1", !JSON.stringify(gemBy).includes("gemini-omni-1.1-flash"));
  // §2/§7 — thinking_level ENUM string only. Inteiro / negativo / "medium" / obj / bool → ERRO
  for (const bad of [2, -1, "medium", {}, true] as unknown[]) {
    const r = build({ atlasModel: gemBy["text-to-video"], byMode: gemBy, mode: "text-to-video", contractDefault: "video-basic", input: { prompt: "x", thinking_level: bad } as Record<string, unknown> });
    check(`Gemini thinking_level inválido (${JSON.stringify(bad)}) → erro`, "error" in r);
  }
  // enum válidos aceitos
  for (const ok of ["default", "low", "high"]) {
    const r = build({ atlasModel: gemBy["text-to-video"], byMode: gemBy, mode: "text-to-video", contractDefault: "video-basic", input: { prompt: "x", thinking_level: ok } });
    check(`Gemini thinking_level "${ok}" aceito`, "body" in r && r.body.thinking_level === ok);
  }

  // ── Reference contract sem refs → erro (não cria body vazio) ──
  const refEmpty = build({ atlasModel: grokBy["reference-to-video"], byMode: grokBy, mode: "reference-to-video", contractDefault: "video-basic", input: { prompt: "x" } });
  check("Reference sem refs → erro (buildBody rejeita)", "error" in refEmpty);

  if (failures.length) throw new Error("route-certification.test falhou:\n - " + failures.join("\n - "));
  console.log("route-certification.test: OK (exact model/mode + exact payload + forgery rejeitada)");
}

run();
});
