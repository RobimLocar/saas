// P5c — Testes da fonte única de UI Audio (audio-ui-spec).
// Runner-agnóstico: assertivas rodam no import (falham alto em vitest/jest/tsx).
// Não depende de React, UI, API, rede ou schema PiAPI. Zero API real.

import {
  resolveAudioUISpec,
  AUDIO_UI_PROFILES,
  MMAUDIO_FUTURE_SPEC,
  audioUISpecToLegacyCaps,
  type AudioUISpec,
  type AudioFieldId,
} from "./audio-ui-spec";
import { test } from "vitest";

test("audio-ui-spec.test.ts", async () => {

const failures: string[] = [];
const check = (name: string, cond: boolean): void => { if (!cond) failures.push(name); };
const field = (s: AudioUISpec, id: AudioFieldId) => s.fields.find((f) => f.id === id);
const hasField = (s: AudioUISpec, id: AudioFieldId) => s.fields.some((f) => f.id === id);
const placement = (s: AudioUISpec, id: AudioFieldId) => field(s, id)?.placement;

// ─── TTS (ElevenLabs v3) ────────────────────────────────────────────────────
{
  const s = resolveAudioUISpec({ modelId: "elevenlabs-flash", kind: "tts", backend: "atlas-tts" });
  check("tts: profile", s.profile === "elevenlabs-v3-tts");
  check("tts: text basic + required", field(s, "text")?.placement === "basic" && field(s, "text")?.required === true);
  check("tts: text maxLength 5000", field(s, "text")?.maxLength === 5000);
  check("tts: voice present", hasField(s, "voice"));
  check("tts: stability 0–1", field(s, "stability")?.number?.min === 0 && field(s, "stability")?.number?.max === 1);
  check("tts: stability product default 0.3", field(s, "stability")?.productDefault === 0.3);
  check("tts: language é advanced", placement(s, "language") === "advanced");
  check("tts: SEM similarity", !hasField(s, "similarity" as AudioFieldId));
  check("tts: SEM speed", !hasField(s, "speed" as AudioFieldId));
  check("tts: sem modos", s.modes === undefined);
}

// ─── Udio ───────────────────────────────────────────────────────────────────
{
  const s = resolveAudioUISpec({ modelId: "udio-music", kind: "music", backend: "music-u" });
  check("udio: profile", s.profile === "udio");
  check("udio: 3 modos", (s.modes?.length ?? 0) === 3);
  const modeIds = (s.modes ?? []).map((m) => m.id).sort().join(",");
  check("udio: modos corretos", modeIds === "ai-vocals,custom-lyrics,instrumental");
  const lyr = field(s, "lyrics");
  check("udio: lyrics condicional em custom-lyrics", JSON.stringify(lyr?.visibleWhen?.modes) === JSON.stringify(["custom-lyrics"]));
  check("udio: prompt basic required", field(s, "prompt")?.placement === "basic" && field(s, "prompt")?.required === true);
  check("udio: negativeTags advanced", placement(s, "negativeTags") === "advanced");
  check("udio: seed advanced", placement(s, "seed") === "advanced");
}

// ─── ACE-Step (música) ──────────────────────────────────────────────────────
{
  const s = resolveAudioUISpec({ modelId: "Qubico/ace-step", kind: "music", backend: "Qubico/ace-step" });
  check("ace-music: profile", s.profile === "ace-step-music");
  const modeIds = (s.modes ?? []).map((m) => m.id).sort().join(",");
  check("ace-music: 2 modos instrumental|lyrics", modeIds === "instrumental,lyrics");
  check("ace-music: lyrics condicional em lyrics", JSON.stringify(field(s, "lyrics")?.visibleWhen?.modes) === JSON.stringify(["lyrics"]));
  check("ace-music: duration suportado", hasField(s, "duration"));
  check("ace-music: duration SEM range inventado", field(s, "duration")?.number === undefined);
  check("ace-music: negativePrompt advanced", placement(s, "negativePrompt") === "advanced");
  check("ace-music: SEM infer_step", !hasField(s, "infer_step" as AudioFieldId));
  check("ace-music: SEM quality", !hasField(s, "quality" as AudioFieldId));
}

// ─── ACE-Step SFX ───────────────────────────────────────────────────────────
{
  const s = resolveAudioUISpec({ modelId: "elevenlabs-sfx", kind: "sfx", backend: "Qubico/ace-step" });
  check("ace-sfx: profile (≠ music)", s.profile === "ace-step-sfx");
  check("ace-sfx: prompt basic", field(s, "prompt")?.placement === "basic");
  check("ace-sfx: NÃO expõe lyrics", !hasField(s, "lyrics"));
  check("ace-sfx: NÃO expõe voice", !hasField(s, "voice"));
}

// ─── Kling Sound SFX (P5g) ──────────────────────────────────────────────────
{
  const s = resolveAudioUISpec({ modelId: "kling-sound", kind: "sfx", backend: "kling" });
  check("kling-sfx: profile", s.profile === "kling-sfx");
  check("kling-sfx: prompt basic required", field(s, "prompt")?.placement === "basic" && field(s, "prompt")?.required === true);
  check("kling-sfx: duration basic required", field(s, "duration")?.placement === "basic" && field(s, "duration")?.required === true);
  check("kling-sfx: SEM lyrics", !hasField(s, "lyrics"));
  check("kling-sfx: SEM negativePrompt", !hasField(s, "negativePrompt"));
  check("kling-sfx: SEM seed", !hasField(s, "seed"));
  check("kling-sfx: SEM voice/stability", !hasField(s, "voice") && !hasField(s, "stability"));
  check("kling-sfx: sem modos", s.modes === undefined);
  // Precedência: Kling (backend kling) resolve ANTES da regra genérica de SFX.
  check("kling-sfx: NÃO cai em ace-step-sfx", s.profile !== "ace-step-sfx");
  // Aliases atuais (backend Qubico/ace-step) continuam ace-step-sfx (não Kling).
  const ace = resolveAudioUISpec({ modelId: "elevenlabs-sfx", kind: "sfx", backend: "Qubico/ace-step" });
  check("kling-sfx: aliases antigos permanecem ace-step-sfx", ace.profile === "ace-step-sfx");
}

// ─── MMAudio real (futuro) ──────────────────────────────────────────────────
{
  const s = MMAUDIO_FUTURE_SPEC;
  check("mmaudio: profile mmaudio-video2audio (P5h-fix)", s.profile === "mmaudio-video2audio");
  check("mmaudio: future flag REMOVIDO (P5h-fix)", s.future === undefined);
  check("mmaudio: video required", field(s, "video")?.required === true);
  check("mmaudio: prompt required (P5h)", field(s, "prompt")?.required === true);
  check("mmaudio: requiredInputs inclui video", s.requiredInputs.some((r) => r.id === "video"));
  check("mmaudio: SEM seed (P5h)", !hasField(s, "seed"));
  check("mmaudio: SEM steps", !hasField(s, "steps" as AudioFieldId));
  check("mmaudio: negativePrompt advanced", placement(s, "negativePrompt") === "advanced");
}

// ─── MMAudio REAL resolvido por backend (P5h) ───────────────────────────────
{
  // SKU verdadeiro futuro (backend Qubico/mmaudio) → profile MMAudio.
  // Identidade candidata do SKU real, com o KIND semântico verdadeiro (video-to-audio):
  // o resolver decide por BACKEND, então o kind não altera o resultado (P5h2-SAFETY).
  const real = resolveAudioUISpec({ modelId: "mmaudio-video2audio", kind: "video-to-audio", backend: "Qubico/mmaudio" });
  check("mmaudio real: profile mmaudio-video2audio", real.profile === "mmaudio-video2audio");
  check("mmaudio real: kind video-to-audio resolve por backend", real.profile === "mmaudio-video2audio");
  check("mmaudio real: video required", field(real, "video")?.required === true);
  check("mmaudio real: prompt required", field(real, "prompt")?.required === true);
  check("mmaudio real: negativePrompt advanced", placement(real, "negativePrompt") === "advanced");
  check("mmaudio real: sem modos", real.modes === undefined);
  // Alias FALSO legado (backend Qubico/ace-step, id mmaudio) NÃO resolve como MMAudio real.
  const legacy = resolveAudioUISpec({ modelId: "mmaudio", kind: "sfx", backend: "Qubico/ace-step" });
  check("mmaudio legacy: continua ace-step-sfx (NÃO mmaudio-video2audio)", legacy.profile === "ace-step-sfx");
  // Também não deve capturar o Kling nem outros backends.
  const kling = resolveAudioUISpec({ modelId: "kling-sound", kind: "sfx", backend: "kling" });
  check("mmaudio rule: não captura Kling", kling.profile === "kling-sfx");
}

// ─── Aliases atuais do catálogo (enganosos) ─────────────────────────────────
{
  // `mmaudio` atual roteia para ACE-Step SFX — NÃO é o MMAudio real.
  const mm = resolveAudioUISpec({ modelId: "mmaudio", kind: "sfx", backend: "Qubico/ace-step" });
  check("alias mmaudio → ace-step-sfx (NÃO mmaudio-video2audio)", mm.profile === "ace-step-sfx");
  // `elevenlabs-sfx` tem provider "atlas" no catálogo, mas NÃO é TTS.
  const sfx = resolveAudioUISpec({ modelId: "elevenlabs-sfx", kind: "sfx", backend: "Qubico/ace-step" });
  check("alias elevenlabs-sfx → ace-step-sfx (NÃO tts)", sfx.profile === "ace-step-sfx");
}

// ─── Source-of-truth: sem cópias divergentes ────────────────────────────────
{
  const flash = resolveAudioUISpec({ modelId: "elevenlabs-flash", kind: "tts", backend: "atlas-tts" });
  const turbo = resolveAudioUISpec({ modelId: "elevenlabs-turbo-v2.5", kind: "tts", backend: "atlas-tts" });
  const multi = resolveAudioUISpec({ modelId: "elevenlabs-multilingual-v2", kind: "tts", backend: "atlas-tts" });
  // Os 3 SKUs TTS resolvem para o MESMO objeto de spec (mesma referência).
  check("3 TTS → mesma spec (identidade)", flash === turbo && turbo === multi);
  const sfxA = resolveAudioUISpec({ modelId: "elevenlabs-sfx", kind: "sfx", backend: "Qubico/ace-step" });
  const sfxB = resolveAudioUISpec({ modelId: "mmaudio", kind: "sfx", backend: "Qubico/ace-step" });
  check("aliases SFX → mesma spec (identidade)", sfxA === sfxB);
}

// ─── Fallback explícito e seguro ────────────────────────────────────────────
{
  const s = resolveAudioUISpec({ modelId: "desconhecido-xyz", kind: "music", backend: "provider-inexistente" });
  check("fallback: generic prompt-only", s.profile === "generic" && s.fields.length === 1 && hasField(s, "prompt"));
}

// ─── Similarity/Speed/infer_step globalmente ausentes ───────────────────────
{
  const banned = ["similarity", "speed", "inferStep", "infer_step", "quality"] as unknown as AudioFieldId[];
  for (const [pid, spec] of Object.entries(AUDIO_UI_PROFILES)) {
    for (const b of banned) {
      check(`${pid}: sem campo ${String(b)}`, !hasField(spec, b));
    }
  }
}

// ─── Projeção legada (compat com capabilities.ts) ───────────────────────────
{
  const tts = audioUISpecToLegacyCaps(AUDIO_UI_PROFILES["elevenlabs-v3-tts"]);
  check("legacy tts: prompt+voice, sem lyrics/duration", tts.prompt && tts.voice && !tts.lyrics && !tts.duration);
  const udio = audioUISpecToLegacyCaps(AUDIO_UI_PROFILES["udio"]);
  check("legacy udio: prompt+lyrics", udio.prompt && udio.lyrics && !udio.voice);
  const aceM = audioUISpecToLegacyCaps(AUDIO_UI_PROFILES["ace-step-music"]);
  check("legacy ace-music: prompt+lyrics+duration", aceM.prompt && aceM.lyrics && aceM.duration);
  const aceS = audioUISpecToLegacyCaps(AUDIO_UI_PROFILES["ace-step-sfx"]);
  check("legacy ace-sfx: só prompt", aceS.prompt && !aceS.voice && !aceS.lyrics && !aceS.duration);
}

if (failures.length > 0) {
  throw new Error(`audio-ui-spec.test falhou:\n - ${failures.join("\n - ")}`);
} else {
  console.log("audio-ui-spec.test: OK (todas as assertivas passaram)");
}
});
