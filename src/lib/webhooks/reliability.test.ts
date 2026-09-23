// VIDEO-RELIABILITY-IMPLEMENT-01 — testes unitários (idempotency + Ed25519 + inbox).
// Runner-agnóstico. Sem provider real. Ed25519 usa keypair gerada localmente.

import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { videoRequestFingerprint, classifyIntentDuplicate, fingerprint } from "@/lib/idempotency";
import { verifyEd25519, verifyAtlasWebhook, _clearAtlasJwksCache } from "@/lib/atlas/webhook-verify";
import { normalizeAtlasEvent, normalizePiapiEvent } from "@/lib/webhooks/inbox";
import { classifySubmitError } from "@/lib/webhooks/reliability-runtime";
import { serializeVideoRequestForMode } from "@/lib/models/mode-serializer";
import { test } from "vitest";

test("reliability.test.ts", async () => {

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };

async function run() {
  // ── Fingerprint ──────────────────────────────────────────────────────────
  const b1 = { model_uuid: "m", prompt: "gato", resolution: "1080p", duration: 8, extra_ui: "x" };
  const b2 = { duration: 8, prompt: "gato", model_uuid: "m", resolution: "1080p", extra_ui: "y" };
  check("fingerprint estável (ordem/campos-UI irrelevantes)", videoRequestFingerprint(b1) === videoRequestFingerprint(b2));
  check("fingerprint muda com prompt", videoRequestFingerprint(b1) !== videoRequestFingerprint({ ...b1, prompt: "cão" }));
  check("fingerprint muda com resolution", videoRequestFingerprint(b1) !== videoRequestFingerprint({ ...b1, resolution: "720p" }));
  check("ordem de refs importa", fingerprint({ r: ["a", "b"] }) !== fingerprint({ r: ["b", "a"] }));

  // ── Duplicate classification ─────────────────────────────────────────────
  const fp = videoRequestFingerprint(b1);
  check("mesmo fingerprint → resume", classifyIntentDuplicate(fp, fp).kind === "resume");
  check("fingerprint diferente → 409", classifyIntentDuplicate("outro", fp).kind === "reuse_conflict");
  check("sem fingerprint existente → 409", classifyIntentDuplicate(null, fp).kind === "reuse_conflict");

  // ── Ed25519 (keypair real) ───────────────────────────────────────────────
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as import("node:crypto").JsonWebKey;
  const ts = String(Math.floor(Date.now() / 1000));
  const rawBody = Buffer.from(JSON.stringify({ session_id: "s1", status: "OK" }));
  const message = Buffer.concat([Buffer.from(`${ts}.`), rawBody]);
  const sigB64 = edSign(null, message, privateKey).toString("base64");

  check("verifyEd25519 válido", verifyEd25519(message, sigB64, jwk) === true);
  check("verifyEd25519 body adulterado → false", verifyEd25519(Buffer.concat([Buffer.from(`${ts}.`), Buffer.from("tampered")]), sigB64, jwk) === false);
  const { publicKey: otherPub } = generateKeyPairSync("ed25519");
  const otherJwk = otherPub.export({ format: "jwk" }) as import("node:crypto").JsonWebKey;
  check("verifyEd25519 chave errada → false", verifyEd25519(message, sigB64, otherJwk) === false);

  // ── verifyAtlasWebhook (orquestração) ────────────────────────────────────
  _clearAtlasJwksCache();
  let jwkFetches = 0;
  const resolver = async (kid: string) => { jwkFetches++; return kid === "k1" ? jwk : null; };
  const okRes = await verifyAtlasWebhook({ rawBody, timestampHeader: ts, signatureHeader: sigB64, kid: "k1", getJwk: resolver });
  check("atlas webhook válido", okRes.ok === true);
  // cache: 2ª verificação com mesmo kid não refaz fetch.
  await verifyAtlasWebhook({ rawBody, timestampHeader: ts, signatureHeader: sigB64, kid: "k1", getJwk: resolver });
  check("JWKS cache por kid (1 fetch)", jwkFetches === 1);
  // kid desconhecido → resolver chamado (re-fetch), retorna null → fail.
  const unk = await verifyAtlasWebhook({ rawBody, timestampHeader: ts, signatureHeader: sigB64, kid: "zzz", getJwk: resolver });
  check("kid desconhecido → fail + refetch", unk.ok === false && jwkFetches === 2);
  // replay: timestamp velho.
  const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
  const stale = await verifyAtlasWebhook({ rawBody, timestampHeader: oldTs, signatureHeader: sigB64, kid: "k1", getJwk: resolver });
  check("timestamp fora da janela → fail (replay)", stale.ok === false);
  // headers ausentes → fail.
  const noHdr = await verifyAtlasWebhook({ rawBody, timestampHeader: null, signatureHeader: null, kid: null, getJwk: resolver });
  check("headers ausentes → fail", noHdr.ok === false);

  // ── Inbox normalization ──────────────────────────────────────────────────
  const a = normalizeAtlasEvent({ sessionId: "sess1", status: "OK", outputs: ["https://cdn/v.mp4"] });
  check("atlas event key = session_id", a.eventKey === "sess1" && a.terminalStatus === "completed" && a.outputs[0] === "https://cdn/v.mp4");
  const ae = normalizeAtlasEvent({ sessionId: "sess2", status: "ERROR", error: "boom" });
  check("atlas ERROR → failed", ae.terminalStatus === "failed" && ae.error === "boom");
  const p = normalizePiapiEvent({ taskId: "t1", status: "completed", outputs: ["u"] });
  check("piapi key = task:status (não timestamp)", p.eventKey === "t1:completed" && p.terminalStatus === "completed");
  const pp = normalizePiapiEvent({ taskId: "t2", status: "processing" });
  check("piapi não-terminal → null", pp.terminalStatus === null);

  // ── §7 — classificação de erro de submit (definite vs ambiguous) ───────────
  check("insufficient credits → definite", classifySubmitError(new Error("insufficient credits")) === "definite_failure");
  check("content moderation → definite", classifySubmitError(new Error("rejected by content moderation")) === "definite_failure");
  check("HTTP 400 → definite", classifySubmitError(new Error("Bad Request 400")) === "definite_failure");
  check("timeout → ambiguous", classifySubmitError(new Error("request timed out")) === "ambiguous");
  check("ECONNRESET → ambiguous", classifySubmitError(new Error("socket hang up ECONNRESET")) === "ambiguous");
  check("HTML/non-JSON → ambiguous", classifySubmitError(new Error("recebeu HTML em vez de JSON")) === "ambiguous");
  check("erro desconhecido → ambiguous (default seguro)", classifySubmitError(new Error("weird")) === "ambiguous");

  // ── §9 — MODE SERIALIZER: campos de mídia não vazam entre modos ────────────
  const grokRef: Record<string, unknown> = { prompt: "x", resolution: "1080p", reference_images: ["a", "b"], reference_image_urls: ["a"] };
  const toText = serializeVideoRequestForMode(grokRef, "text-to-video");
  check("Reference→Text remove refs", !("reference_images" in toText) && !("reference_image_urls" in toText) && toText.prompt === "x");
  const veoStartEnd: Record<string, unknown> = { prompt: "y", start_image_url: "s", end_image_url: "e" };
  const toSeedanceText = serializeVideoRequestForMode(veoStartEnd, "text-to-video");
  check("Start-End→Text remove frames", !("start_image_url" in toSeedanceText) && !("end_image_url" in toSeedanceText));
  const i2v = serializeVideoRequestForMode({ prompt: "z", start_image_url: "s", end_image_url: "e", reference_images: ["r"] } as Record<string, unknown>, "image-to-video");
  check("i2v mantém start, remove end+refs", i2v.start_image_url === "s" && !("end_image_url" in i2v) && !("reference_images" in i2v));
  const refMode = serializeVideoRequestForMode({ prompt: "z", reference_images: ["r"], start_image_url: "s" } as Record<string, unknown>, "reference-to-video");
  check("reference mantém refs, remove start", "reference_images" in refMode && !("start_image_url" in refMode));
  const noMode = serializeVideoRequestForMode({ prompt: "z", start_image_url: "s" } as Record<string, unknown>, undefined);
  check("sem modo (PiAPI clássico) → body intacto", noMode.start_image_url === "s");

  if (failures.length > 0) throw new Error(`reliability.test falhou:\n - ${failures.join("\n - ")}`);
  console.log("reliability.test: OK");
}

void run().then(() => {}, (e) => { console.error(e.message); process.exit(1); });
});
