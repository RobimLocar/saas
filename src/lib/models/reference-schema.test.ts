// FLUXYRA-AI-PRODUCT-COMPLETION-02 — reference/media + multi-shot + advanced specs.
import {
  mediaTypeFromUrl, validateReferenceRefs, validateKlingMultiShot, buildKlingMultiPrompt,
  advancedParamsSpec, validateVoiceIds, validateElements, buildKlingAdvanced, GROK_VOICE_IDS, elementTag,
} from "@/lib/models/reference-schema";
import { test } from "vitest";

test("reference-schema.test.ts", async () => {

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

function run() {
  // media type
  check("image url", mediaTypeFromUrl("https://x/a.jpg") === "image");
  check("video url", mediaTypeFromUrl("https://x/a.mp4") === "video");
  check("audio url", mediaTypeFromUrl("https://x/a.mp3?sig=1") === "audio");

  // §17 — H3 reference: audio-only inválido; ≥1 image/video ok.
  check("audio-only → inválido", validateReferenceRefs(["https://x/a.mp3", "https://x/b.wav"], { requireVisual: true, strictUnknown: true }).ok === false);
  check("com imagem → ok", validateReferenceRefs(["https://x/a.mp3", "https://x/b.jpg"], { requireVisual: true }).ok === true);
  check("com vídeo → ok", validateReferenceRefs(["https://x/a.mp4"], { requireVisual: true }).ok === true);
  check("vazio → inválido", validateReferenceRefs([], { requireVisual: true }).ok === false);
  check("acima do max → inválido", validateReferenceRefs(["https://x/1.jpg","https://x/2.jpg","https://x/3.jpg"], { max: 2 }).ok === false);

  // Multi-shot Kling
  check("shots soma == total → ok", validateKlingMultiShot([{ prompt: "a", duration: 3 }, { prompt: "b", duration: 2 }], 5).ok === true);
  check("soma != total → erro", validateKlingMultiShot([{ prompt: "a", duration: 3 }, { prompt: "b", duration: 3 }], 5).ok === false);
  check(">6 shots → erro", validateKlingMultiShot(Array.from({ length: 7 }, () => ({ prompt: "x", duration: 1 })), 7).ok === false);
  check("shot <1s → erro", validateKlingMultiShot([{ prompt: "a", duration: 0 }], 0).ok === false);
  check("shot sem prompt → erro", validateKlingMultiShot([{ prompt: "  ", duration: 5 }], 5).ok === false);
  check("multi_prompt build", JSON.stringify(buildKlingMultiPrompt([{ prompt: " a ", duration: 3 }])) === JSON.stringify([{ prompt: "a", duration: 3 }]));

  // Advanced spec by mode
  const seedanceSpec = advancedParamsSpec({ "image-to-video": ["generate_audio", "camera_fixed", "seed"] }, null, "image-to-video");
  check("seedance i2v advanced = camera_fixed+seed (generate_audio no toggle principal)", seedanceSpec.map((s) => s.id).join(",") === "camera_fixed,seed");
  const grokRef = advancedParamsSpec({ "reference-to-video": ["voice_ids"] }, null, "reference-to-video");
  check("grok ref advanced = voice_ids (max 3)", grokRef.length === 1 && grokRef[0].id === "voice_ids" && grokRef[0].max === 3);
  const grokT2V = advancedParamsSpec({ "reference-to-video": ["voice_ids"] }, null, "text-to-video");
  check("grok t2v → sem advanced (voice_ids só no reference)", grokT2V.length === 0);

  // §1 — Grok voice_ids
  check("voice preset válido", validateVoiceIds(["luna", "orion"]).ok === true);
  check("voice >3 → erro", validateVoiceIds(["luna", "orion", "atlas", "rex"]).ok === false);
  check("voice inválida → erro", validateVoiceIds(["notavoice"]).ok === false);
  check("26 presets oficiais", GROK_VOICE_IDS.length === 26);

  // §5 — O3 elements: SHAPE OFICIAL image_refer/video_refer (NÃO image/video)
  check("element image_refer válido", validateElements([{ reference_type: "image_refer", frontal_image: "https://x/a.jpg" }]).ok === true);
  check("element video_refer válido", validateElements([{ reference_type: "video_refer", refer_videos: ["https://x/a.mp4"] }]).ok === true);
  check("element image_refer sem imagem → erro", validateElements([{ reference_type: "image_refer" }]).ok === false);
  check("element type GENÉRICO 'image' → erro (não é o contrato)", validateElements([{ reference_type: "image", frontal_image: "https://x/a.jpg" }]).ok === false);
  check("element type inválido → erro", validateElements([{ reference_type: "audio" }]).ok === false);
  check("elements acima do max → erro", validateElements(Array.from({ length: 5 }, () => ({ reference_type: "image_refer", frontal_image: "https://x/a.jpg" })), 4).ok === false);
  // element_id (existente) mutuamente exclusivo com definição inline
  check("element_id sozinho válido", validateElements([{ reference_type: "image_refer", element_id: "el_123" }]).ok === true);
  check("element_id + inline → erro (exclusivos)", validateElements([{ reference_type: "image_refer", element_id: "el_123", frontal_image: "https://x/a.jpg" }]).ok === false);
  check("element_id + element_name → erro (exclusivos)", validateElements([{ reference_type: "video_refer", element_id: "el_9", element_name: "x" }]).ok === false);
  // shape final normalizado
  const ev = validateElements([{ reference_type: "image_refer", frontal_image: "https://x/a.jpg", element_name: " Ana ", element_description: " front " }]);
  check("element normalizado (trim name/desc)", ev.ok === true && ev.value![0].element_name === "Ana" && ev.value![0].element_description === "front");
  // §6 — tag posicional 1-based
  check("elementTag 1-based", elementTag(0) === "<<<element_1>>>" && elementTag(2) === "<<<element_3>>>");

  // §14 — buildKlingAdvanced: custom multi-shot + sound + cfg + negative
  const kc = buildKlingAdvanced({ sound: true, cfg_scale: 0.5, negative_prompt: "blur", multi_shot: true, shot_type: "customize", multi_prompt: [{ prompt: "a", duration: 5 }, { prompt: "b", duration: 5 }] }, 10);
  check("kling custom → multi_shot/shot_type/multi_prompt/sound/cfg/neg", kc.ok === true && kc.body!.multi_shot === true && kc.body!.shot_type === "customize" && Array.isArray(kc.body!.multi_prompt) && kc.body!.sound === true && kc.body!.cfg_scale === 0.5 && kc.body!.negative_prompt === "blur");
  check("kling custom soma!=total → erro", buildKlingAdvanced({ multi_shot: true, shot_type: "customize", multi_prompt: [{ prompt: "a", duration: 3 }] }, 10).ok === false);
  const ki = buildKlingAdvanced({ multi_shot: true, shot_type: "intelligence" }, 10);
  check("kling intelligence → sem multi_prompt", ki.ok === true && ki.body!.shot_type === "intelligence" && !("multi_prompt" in ki.body!));
  check("cfg_scale fora de 0..1 → erro", buildKlingAdvanced({ cfg_scale: 2 }, 10).ok === false);
  check("shot_type inválido → erro", buildKlingAdvanced({ multi_shot: true, shot_type: "zzz" }, 10).ok === false);

  // PRE-SMOKE §3 — thinking_level exposto no advancedParamsSpec p/ Gemini STANDARD
  const gemSpec = advancedParamsSpec({ "text-to-video": ["seed", "thinking_level"] }, null, "text-to-video");
  check("gemini spec inclui seed", gemSpec.some((s) => s.id === "seed"));
  const tl = gemSpec.find((s) => s.id === "thinking_level");
  check("gemini thinking_level = enum default/low/high", !!tl && tl.type === "enum" && JSON.stringify(tl.options) === JSON.stringify(["default", "low", "high"]));

  if (failures.length) throw new Error("reference-schema.test falhou:\n - " + failures.join("\n - "));
  console.log("reference-schema.test: OK (H3 visual-ref + multi-shot + advanced spec)");
}

run();
});
