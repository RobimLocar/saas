// P11a — Testes dos CONTRACT PROFILES do Atlas (puros, runner-agnóstico).
// Provam: allowlist estrita (campos arbitrários rejeitados), obrigatórios, validação,
// output kind, billing shapes, e "dois modelos no MESMO profile → mesmo shape de body
// SEM mudar código" (o catálogo só troca o atlas_model).

import { ATLAS_CONTRACTS, getAtlasContract, billingShapeCompatible } from "./profiles";
import { test } from "vitest";

test("profiles.test.ts", async () => {

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

// ── image-basic: allowlist + validação + dois modelos mesmo profile ───────────
{
  const p = ATLAS_CONTRACTS["image-basic"];
  const a = p.buildBody("seedream-x", { prompt: "gato", aspect_ratio: "9:16", evil: "DROP", seed: 7 });
  check("image-basic ok", a.ok === true);
  if (a.ok) {
    check("image-basic body model", a.body.model === "seedream-x");
    check("image-basic body prompt", a.body.prompt === "gato");
    check("image-basic body aspect", a.body.aspect_ratio === "9:16");
    check("image-basic body seed", a.body.seed === 7);
    check("image-basic ARBITRARY field dropped", !("evil" in a.body));
  }
  // Modelo B, mesmo profile, mesma entrada → mesmo shape, só troca o model.
  const b = p.buildBody("recraft-y", { prompt: "gato", aspect_ratio: "9:16" });
  check("image-basic modelB ok", b.ok === true && (!b.ok || b.body.model === "recraft-y"));
  check("image-basic modelB same shape", b.ok && "prompt" in b.body && "aspect_ratio" in b.body);
  // required + validação
  check("image-basic sem prompt → erro", p.buildBody("m", { aspect_ratio: "1:1" }).ok === false);
  check("image-basic aspect inválido → erro", p.buildBody("m", { prompt: "x", aspect_ratio: "5:5" }).ok === false);
  check("image-basic outputKind media", p.outputKind === "media");
}

// ── image-size: contrato DIFERENTE (usa size, não aspect_ratio) ───────────────
{
  const p = ATLAS_CONTRACTS["image-size"];
  const a = p.buildBody("m", { prompt: "x", size: "1024x1024", aspect_ratio: "9:16" });
  check("image-size ok", a.ok === true);
  check("image-size usa size", a.ok && a.body.size === "1024x1024");
  check("image-size IGNORA aspect_ratio (não permitido)", a.ok && !("aspect_ratio" in a.body));
  check("image-size sem size → erro", p.buildBody("m", { prompt: "x" }).ok === false);
}

// ── image-edit: prova que NÃO é hardcode txt2img (exige image_urls) ───────────
{
  const p = ATLAS_CONTRACTS["image-edit"];
  const a = p.buildBody("upscaler", { image_urls: ["https://a/x.png", "not-a-url"], prompt: "melhora" });
  check("image-edit ok", a.ok === true);
  check("image-edit filtra URLs http", a.ok && Array.isArray(a.body.image_urls) && (a.body.image_urls as string[]).length === 1);
  check("image-edit sem image_urls → erro", p.buildBody("m", { prompt: "x" }).ok === false);
}

// ── video profiles ────────────────────────────────────────────────────────────
{
  const vb = ATLAS_CONTRACTS["video-basic"];
  check("video-basic endpoint", vb.endpoint === "generateVideo");
  const a = vb.buildBody("kling-atlas", { prompt: "cena", duration: 5, aspect_ratio: "16:9" });
  check("video-basic ok", a.ok === true && (!a.ok || a.body.duration === 5));
  check("video-basic duration inválida → erro", vb.buildBody("m", { prompt: "x", duration: -1 }).ok === false);
  check("video-basic billing cps", vb.billingShapes.includes("credit_per_second"));

  const vi = ATLAS_CONTRACTS["video-image"];
  check("video-image exige image_url", vi.buildBody("m", { prompt: "x" }).ok === false);
  check("video-image com image_url ok", vi.buildBody("m", { image_url: "https://a/x.png" }).ok === true);
}

// ── audio: media vs text ──────────────────────────────────────────────────────
{
  const af = ATLAS_CONTRACTS["audio-file"];
  check("audio-file outputKind media", af.outputKind === "media");
  check("audio-file exige text|prompt", af.buildBody("m", {}).ok === false);
  check("audio-file com text ok", af.buildBody("tts", { text: "olá" }).ok === true);

  const at = ATLAS_CONTRACTS["audio-text"];
  check("audio-text outputKind text", at.outputKind === "text");
  check("audio-text exige audio_url", at.buildBody("asr", {}).ok === false);
  check("audio-text com audio_url ok", at.buildBody("asr", { audio_url: "https://a/x.mp3" }).ok === true);
}

// ── helpers ───────────────────────────────────────────────────────────────────
check("getAtlasContract conhecido", getAtlasContract("image-basic")?.id === "image-basic");
check("getAtlasContract desconhecido → null", getAtlasContract("nope") === null);
check("billing shape compatível", billingShapeCompatible("video-basic", "credit_per_second") === true);
check("billing shape incompatível", billingShapeCompatible("image-basic", "credit_per_second") === false);

if (failures.length > 0) throw new Error(`atlas/profiles.test falhou:\n - ${failures.join("\n - ")}`);
else console.log("atlas/profiles.test: OK");
});
