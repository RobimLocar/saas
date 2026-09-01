// Testes da fonte única de capabilities (camada PRODUTO/UI).
// Runner-agnóstico: as assertivas rodam no import (falham alto em vitest/jest/tsx).
// Não depende de React, UI, API ou schema PiAPI.

import {
  resolveCapabilities,
  resolveUISpec,
  KNOWN_MODEL_IDS,
  type ModelType,
  type VideoCapabilities,
  type ImageCapabilities,
  type AudioCapabilities,
} from "./capabilities";

const failures: string[] = [];

function check(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

function asVideo(model_id: string): VideoCapabilities {
  const c = resolveCapabilities({ model_id, type: "video" });
  if (c.kind !== "video") throw new Error(`${model_id} não é video`);
  return c;
}
function asImage(model_id: string): ImageCapabilities {
  const c = resolveCapabilities({ model_id, type: "image" });
  if (c.kind !== "image") throw new Error(`${model_id} não é image`);
  return c;
}
function asAudio(model_id: string, kind: string): AudioCapabilities {
  const c = resolveCapabilities({ model_id, type: "audio", kind });
  if (c.kind !== "audio") throw new Error(`${model_id} não é audio`);
  return c;
}

// 1. Todos os modelos ativos possuem capabilities + uiSpec com prompt no basic.
(Object.keys(KNOWN_MODEL_IDS) as ModelType[]).forEach((type) => {
  KNOWN_MODEL_IDS[type].forEach((model_id) => {
    const caps = resolveCapabilities({ model_id, type });
    check(`${model_id}: kind==${type}`, caps.kind === type);
    check(`${model_id}: prompt=true`, caps.prompt === true);
    const ui = resolveUISpec({ model_id, type });
    check(`${model_id}: basic inclui prompt`, ui.basic.includes("prompt"));
  });
});

// 2. Kling Avatar
{
  const a = asVideo("kling-avatar");
  check("avatar.dubbingAudio=true", a.dubbingAudio === true);
  check("avatar.startFrame=true", a.startFrame === true);
  check("avatar.endFrame=false", a.endFrame === false);
  check("avatar.omni=false", a.omni === false);
}

// 3. Kling Video (kling-3.0)
{
  const k = asVideo("kling-3.0");
  check("kling-3.0.startFrame=true", k.startFrame === true);
  check("kling-3.0.endFrame=true", k.endFrame === true);
}

// 4. Flux
check("flux.guidance=true", asImage("Qubico/flux1-dev").guidance === true);

// 5. Qwen
check("qwen.steps=true", asImage("qwen-image").steps === true);

// 6. TTS
check("tts.voice=true", asAudio("elevenlabs-flash", "tts").voice === true);

// 7. PARIDADE com o VCaps antigo do Flow Builder (snapshot congelado em 2026-09-01).
//    Garante: nenhuma capability removida, nenhuma nova inesperada, sem mudança visual.
type VCapsSnap = {
  endFrame: boolean; audio: boolean; multiShot: boolean; omni: boolean;
  aspects: string[]; resolutions: string[]; duration: unknown;
  avatarAudio?: boolean; motionVideo?: boolean; veoRefs?: boolean; seed?: boolean;
  refAudio?: boolean; refVideo?: boolean; rule1080Dur6?: boolean; wanExtras?: boolean;
};
const SEED = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const KV = ["16:9", "9:16", "1:1"];
const VEO = ["16:9", "9:16"];
const WAN = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const OLD_VCAPS: Record<string, VCapsSnap> = {
  "kling-3.0": { endFrame: true, audio: true, multiShot: true, omni: false, aspects: KV, resolutions: ["720p", "1080p"], duration: { type: "range", min: 3, max: 15 } },
  "kling-2.5-turbo": { endFrame: true, audio: false, multiShot: false, omni: false, aspects: KV, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [5, 10] } },
  "kling-omni": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: KV, resolutions: ["720p", "1080p"], duration: { type: "range", min: 3, max: 15 } },
  "kling-3.0-motion": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: KV, resolutions: ["1080p"], duration: { type: "range", min: 3, max: 30 }, motionVideo: true },
  "kling-avatar": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: [], resolutions: ["720p"], duration: { type: "enum", values: [4, 8] }, avatarAudio: true },
  "seedance-2.0": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEED, resolutions: ["480p", "720p", "1080p"], duration: { type: "range", min: 4, max: 15 }, refAudio: true, refVideo: true },
  "seedance-2.0-less-restriction": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEED, resolutions: ["480p", "720p", "1080p"], duration: { type: "range", min: 4, max: 15 }, refAudio: true, refVideo: true },
  "seedance-2.0-fast": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEED, resolutions: ["480p", "720p"], duration: { type: "range", min: 4, max: 15 }, refAudio: true, refVideo: true },
  "seedance-1.5-pro": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEED, resolutions: ["480p", "720p"], duration: { type: "range", min: 4, max: 15 }, refAudio: true, refVideo: true },
  "seedance-2.5": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEED, resolutions: ["480p", "720p", "1080p"], duration: { type: "range", min: 4, max: 30 }, refAudio: true, refVideo: true },
  "veo-3.1-quality": { endFrame: true, audio: true, multiShot: false, omni: false, aspects: VEO, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] }, veoRefs: true, seed: true },
  "veo-3.1-fast": { endFrame: true, audio: true, multiShot: false, omni: false, aspects: VEO, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] }, veoRefs: true, seed: true },
  "veo-3": { endFrame: false, audio: true, multiShot: false, omni: false, aspects: VEO, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] }, seed: true },
  "veo-3-fast": { endFrame: false, audio: true, multiShot: false, omni: false, aspects: VEO, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] }, seed: true },
  "hailuo": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: [], resolutions: ["720p", "1080p"], duration: { type: "enum", values: [6, 10] }, rule1080Dur6: true },
  "hailuo-live": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: [], resolutions: ["720p", "1080p"], duration: { type: "enum", values: [6, 10] }, rule1080Dur6: true },
  "wan-2.1-video": { endFrame: false, audio: true, multiShot: false, omni: false, aspects: WAN, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [5, 10, 15] }, wanExtras: true },
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
Object.keys(OLD_VCAPS).forEach((id) => {
  const o = OLD_VCAPS[id];
  const c = asVideo(id);
  check(`parity ${id}.endFrame`, o.endFrame === c.endFrame);
  check(`parity ${id}.audio`, o.audio === c.audio);
  check(`parity ${id}.multiShot`, o.multiShot === c.multiShot);
  check(`parity ${id}.omni`, o.omni === c.omni);
  check(`parity ${id}.aspects`, eq(o.aspects, c.aspectRatio));
  check(`parity ${id}.resolutions`, eq(o.resolutions, c.resolution));
  check(`parity ${id}.duration`, eq(o.duration, c.duration));
  check(`parity ${id}.avatarAudio→dubbingAudio`, Boolean(o.avatarAudio) === c.dubbingAudio);
  check(`parity ${id}.motionVideo→motion`, Boolean(o.motionVideo) === c.motion);
  check(`parity ${id}.veoRefs`, Boolean(o.veoRefs) === c.veoRefs);
  check(`parity ${id}.seed`, Boolean(o.seed) === c.seed);
  check(`parity ${id}.refAudio`, Boolean(o.refAudio) === c.refAudio);
  check(`parity ${id}.refVideo→referenceVideo`, Boolean(o.refVideo) === c.referenceVideo);
  check(`parity ${id}.rule1080Dur6`, Boolean(o.rule1080Dur6) === c.rule1080Dur6);
  check(`parity ${id}.wanExtras`, Boolean(o.wanExtras) === c.wanExtras);
});

export function runCapabilitiesTests(): string[] {
  return failures;
}

if (failures.length > 0) {
  throw new Error(`capabilities.test falhou:\n - ${failures.join("\n - ")}`);
} else {
  console.log("capabilities.test: OK (todas as assertivas passaram)");
}
