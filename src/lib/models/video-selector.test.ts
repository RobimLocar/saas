// COMPETITOR-VIDEO-01 — Testes do seletor (puro, runner-agnóstico).

import {
  groupVideoModelsByFamily,
  modelBadges,
  modelModes,
  resolutionOptions,
  durationBounds,
  modelChips,
  isValidCombo,
  hasNativeAudio,
  VIDEO_FAMILY_ORDER,
  type VideoModelMeta,
} from "./video-selector";
import { test } from "vitest";

test("video-selector.test.ts", async () => {
const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

const mk = (o: Partial<VideoModelMeta>): VideoModelMeta =>
  ({ id: o.model_id || "x", model_id: o.model_id || "x", name: o.name || "X", ...o });

const models: VideoModelMeta[] = [
  mk({ model_id: "gemini-omni-flash", name: "Gemini Omni Flash", family: "Gemini Omni Flash" }),
  mk({ model_id: "kling-3.0", name: "Kling 3.0", family: "Kling", badges: ["MULTI", "AUDIO"], has_audio: true, credit_per_second: { "720p": 12, "1080p": 16 }, dur_min: 3, dur_max: 15, modes: ["text-to-video", "multi-shot"] }),
  mk({ model_id: "seedance-2.5", name: "Seedance 2.5", family: "Seedance", credit_per_second: { "480p": 13, "720p": 31, "1080p": 71 } }),
  mk({ model_id: "veo-3.1-lite", name: "Veo 3.1 Lite", family: "Veo", resolution: "1080p", dur_min: 4, dur_max: 8, resolution_duration_rule: "1080p requires 8s", credit_per_second: { "720p": 12, "1080p": 12 } }),
  mk({ model_id: "grok", name: "Grok", family: "Grok" }),
  mk({ model_id: "custom", name: "Custom", family: "ZZZ-Unknown" }),
];

// ── ordem de família ──────────────────────────────────────────────────────────
{
  const groups = groupVideoModelsByFamily(models);
  const fams = groups.map((g) => g.family);
  check("Kling antes de Seedance", fams.indexOf("Kling") < fams.indexOf("Seedance"));
  check("Seedance antes de Veo", fams.indexOf("Seedance") < fams.indexOf("Veo"));
  check("Veo antes de Grok", fams.indexOf("Veo") < fams.indexOf("Grok"));
  check("Grok antes de Gemini Omni Flash", fams.indexOf("Grok") < fams.indexOf("Gemini Omni Flash"));
  check("família desconhecida por último", fams[fams.length - 1] === "ZZZ-Unknown");
  check("FAMILY_ORDER tem 8 famílias", VIDEO_FAMILY_ORDER.length === 8);
}

// ── badges / modes / audio ────────────────────────────────────────────────────
{
  const k = models[1];
  check("badges do catálogo", JSON.stringify(modelBadges(k)) === JSON.stringify(["MULTI", "AUDIO"]));
  check("modes do catálogo", modelModes(k).includes("multi-shot"));
  check("audio nativo true", hasNativeAudio(k) === true);
  check("sem badges → []", modelBadges(models[4]).length === 0);
  check("sem modes → default t2v", JSON.stringify(modelModes(models[4])) === JSON.stringify(["text-to-video"]));
  check("sem audio flag → false", hasNativeAudio(models[4]) === false);
}

// ── resoluções por modelo (metadata, não array global) ────────────────────────
{
  check("kling 3.0 resoluções = chaves cps", JSON.stringify(resolutionOptions(models[1])) === JSON.stringify(["720p", "1080p"]));
  check("seedance 2.5 tem 480/720/1080", resolutionOptions(models[2]).length === 3);
  check("durationBounds kling 3-15", durationBounds(models[1]).min === 3 && durationBounds(models[1]).max === 15);
  const chips = modelChips(models[1]);
  check("chips incluem duração", chips.some((c) => c.includes("3s") || c.includes("15s")));
}

// ── isValidCombo: bloqueio de combinação inválida (sem correção silenciosa) ────
{
  const kling = models[1];
  check("kling 1080p ok", isValidCombo(kling, { resolution: "1080p", duration: 10 }).ok === true);
  check("kling 4k inválido", isValidCombo(kling, { resolution: "4K", duration: 10 }).ok === false);
  check("kling dur abaixo do min", isValidCombo(kling, { duration: 2 }).ok === false);
  check("kling dur acima do max", isValidCombo(kling, { duration: 20 }).ok === false);

  // Veo 3.1 Lite: 1080p exige 8s.
  const lite = models[3];
  check("veo lite 1080p+8s ok", isValidCombo(lite, { resolution: "1080p", duration: 8 }).ok === true);
  check("veo lite 1080p+4s BLOQUEIA", isValidCombo(lite, { resolution: "1080p", duration: 4 }).ok === false);
  check("veo lite 720p+4s ok", isValidCombo(lite, { resolution: "720p", duration: 4 }).ok === true);

  // Reference count (Grok máx. 7).
  const grok = mk({ model_id: "grok", name: "Grok", max_reference_images: 7, dur_min: 1, dur_max: 15 });
  check("grok 7 refs ok", isValidCombo(grok, { referenceCount: 7 }).ok === true);
  check("grok 8 refs BLOQUEIA", isValidCombo(grok, { referenceCount: 8 }).ok === false);

  // Resolução POR MODO: Grok reference = 480/720 only (1080 → bloqueia).
  const grokM = mk({
    model_id: "grok", name: "Grok", dur_min: 1, dur_max: 15,
    credit_per_second: { "480p": 11, "720p": 11, "1080p": 11 },
    resolution_by_mode: { "reference-to-video": ["480p", "720p"] },
  });
  check("grok text 1080 ok", isValidCombo(grokM, { mode: "text-to-video", resolution: "1080p" }).ok === true);
  check("grok reference 1080 BLOQUEIA", isValidCombo(grokM, { mode: "reference-to-video", resolution: "1080p" }).ok === false);
  check("grok reference 720 ok", isValidCombo(grokM, { mode: "reference-to-video", resolution: "720p" }).ok === true);
}

if (failures.length > 0) throw new Error(`video-selector.test falhou:\n - ${failures.join("\n - ")}`);
else console.log("video-selector.test: OK");
});
