// FLUXYRA-ATLAS-ADDITIVE-ACTIVATION-01 — resolver de capabilities: PARIDADE PiAPI
// (fallback == hardcode atual do dock) + metadata-driven para Atlas.
import { resolveVideoCapabilities, durationsForResolution, type VideoModelForCaps } from "@/lib/models/video-capabilities";
import { test } from "vitest";

test("video-capabilities.test.ts", async () => {

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function run() {
  // ── PARIDADE PiAPI (fallback reproduz o dock atual) ────────────────────────
  const veo: VideoModelForCaps = { backend: "veo3.1", dur_min: 4, dur_max: 8 };
  let c = resolveVideoCapabilities(veo, "text-to-video");
  check("veo3.1 resolutions [720,1080]", eq(c.resolutions, ["720p", "1080p"]));
  check("veo3.1 aspect [16:9,9:16]", eq(c.aspectRatios, ["16:9", "9:16"]));
  check("veo3.1 duration enum [4,6,8]", c.duration.kind === "enum" && eq(c.duration.values, [4, 6, 8]));

  const wan: VideoModelForCaps = { backend: "wan" };
  c = resolveVideoCapabilities(wan, "text-to-video");
  check("wan res [720,1080]", eq(c.resolutions, ["720p", "1080p"]));
  check("wan dur [5,10,15]", eq(c.duration.values, [5, 10, 15]));
  check("wan aspect 5", eq(c.aspectRatios, ["16:9", "9:16", "1:1", "4:3", "3:4"]));

  const hailuo6 = resolveVideoCapabilities({ backend: "hailuo" }, "text-to-video", 6);
  check("hailuo dur<=8 → [768,1080]", eq(hailuo6.resolutions, ["768p", "1080p"]));
  const hailuo10 = resolveVideoCapabilities({ backend: "hailuo" }, "text-to-video", 10);
  check("hailuo dur>8 → [768]", eq(hailuo10.resolutions, ["768p"]));

  const kling: VideoModelForCaps = { family: "Kling", backend: "kling" };
  check("kling res [720,1080]", eq(resolveVideoCapabilities(kling, "text-to-video").resolutions, ["720p", "1080p"]));
  const seedFast: VideoModelForCaps = { backend: "seedance", task_type: "seedance-2-fast" };
  check("seedance fast res [480,720]", eq(resolveVideoCapabilities(seedFast, "text-to-video").resolutions, ["480p", "720p"]));
  const unknown = resolveVideoCapabilities({ backend: "zzz", dur_min: 4, dur_max: 15 }, "text-to-video");
  check("default res", eq(unknown.resolutions, ["480p", "720p", "1080p"]));
  check("default duration range 4-15", unknown.duration.kind === "range" && unknown.duration.min === 4 && unknown.duration.max === 15);
  check("default audio toggle", unknown.audio === "toggle");
  check("has_audio=false → none", resolveVideoCapabilities({ backend: "zzz", has_audio: false }, "text-to-video").audio === "none");

  // ── ATLAS metadata-driven (por mode) ───────────────────────────────────────
  // Veo 3.1 Lite: 720 (4/6/8) e 1080 (8-only); start-end exige 2 frames.
  const veoLite: VideoModelForCaps = {
    runtime_provider: "atlas", model_id: "veo-3.1-lite",
    resolution_by_mode: { "text-to-video": ["720p", "1080p"], "image-to-video": ["720p", "1080p"], "start-end-frame": ["720p", "1080p"] },
    duration_options: [4, 6, 8], duration_by_resolution: { "1080p": [8] },
    aspect_ratios: ["16:9", "9:16"], audio_mode: "always",
  };
  const vlT2V = resolveVideoCapabilities(veoLite, "text-to-video");
  check("VeoLite metadata res", eq(vlT2V.resolutions, ["720p", "1080p"]));
  check("VeoLite duration enum [4,6,8]", eq(vlT2V.duration.values, [4, 6, 8]));
  check("VeoLite audio always", vlT2V.audio === "always");
  check("VeoLite 1080p → só 8s", eq(durationsForResolution(vlT2V, veoLite, "1080p").values, [8]));
  check("VeoLite 720p → [4,6,8]", eq(durationsForResolution(vlT2V, veoLite, "720p").values, [4, 6, 8]));
  const vlSE = resolveVideoCapabilities(veoLite, "start-end-frame");
  check("VeoLite start-end exige 2 frames", vlSE.references?.min === 2 && vlSE.references?.max === 2);

  // Grok: t2v/i2v 480/720/1080; reference 480/720, até 7 refs.
  const grok: VideoModelForCaps = {
    runtime_provider: "atlas", model_id: "grok-imagine-video", max_reference_images: 7,
    resolution_by_mode: { "text-to-video": ["480p", "720p", "1080p"], "reference-to-video": ["480p", "720p"] },
  };
  check("Grok t2v res 480/720/1080", eq(resolveVideoCapabilities(grok, "text-to-video").resolutions, ["480p", "720p", "1080p"]));
  const grokRef = resolveVideoCapabilities(grok, "reference-to-video");
  check("Grok ref res 480/720 (mode-specific)", eq(grokRef.resolutions, ["480p", "720p"]));
  check("Grok ref até 7 refs", grokRef.references?.max === 7 && grokRef.references?.min === 1);

  // MiniMax H3: 768/2K.
  const h3: VideoModelForCaps = { runtime_provider: "atlas", model_id: "minimax-h3", resolutions: ["768p", "2k"], duration_options: [5, 8, 10, 15] };
  check("H3 res 768/2k", eq(resolveVideoCapabilities(h3, "text-to-video").resolutions, ["768p", "2k"]));

  // SPECIAL features (multi-shot) — evita controle FALSO.
  check("multi-shot só quando modes/badges provam", resolveVideoCapabilities({ modes: ["text-to-video"], badges: ["4K", "AUDIO"] }, "text-to-video").special.includes("multi-shot") === false);
  check("multi-shot presente quando modes inclui", resolveVideoCapabilities({ modes: ["text-to-video", "multi-shot"] }, "text-to-video").special.includes("multi-shot") === true);
  check("omni presente quando modes inclui", resolveVideoCapabilities({ modes: ["omni"] }, "text-to-video").special.includes("omni") === true);

  // capabilities_by_mode override total.
  const cbm: VideoModelForCaps = { runtime_provider: "atlas", capabilities_by_mode: { "image-to-video": { resolutions: ["4k"], audio: "always", duration: { kind: "enum", values: [5] } } } };
  const ci = resolveVideoCapabilities(cbm, "image-to-video");
  check("capabilities_by_mode override", eq(ci.resolutions, ["4k"]) && ci.audio === "always" && eq(ci.duration.values, [5]));

  if (failures.length) throw new Error("video-capabilities.test falhou:\n - " + failures.join("\n - "));
  console.log("video-capabilities.test: OK (PiAPI parity + Atlas metadata-driven por mode)");
}

run();
});
