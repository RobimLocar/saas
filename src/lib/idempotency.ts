import { createHash } from "node:crypto";

// VIDEO-RELIABILITY-IMPLEMENT-01 — Fingerprint canônico da INTENÇÃO de geração.
// Detecta reuso de um generation_intent_id para CONTEÚDO diferente (409). Inclui
// só campos que afetam materialmente provider/validação/billing; exclui o próprio
// intent id, timestamps voláteis e campos só-de-UI.

/** Canonicaliza determinísticamente (ordena chaves de objetos; preserva ordem de
 *  arrays — a ordem das referências importa para o provider). */
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val === undefined) continue;
      out[k] = canonicalize(val);
    }
    return out;
  }
  return v;
}

export function fingerprint(fields: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(fields))).digest("hex");
}

/** Extrai os campos materiais de um request de vídeo (Studio/Flow). */
export function videoRequestFingerprint(body: Record<string, unknown>): string {
  return fingerprint({
    model_uuid: body.model_uuid ?? null,
    mode: body.mode ?? "text-to-video",
    prompt: typeof body.prompt === "string" ? body.prompt.trim() : null,
    negative_prompt: typeof body.negative_prompt === "string" ? body.negative_prompt.trim() : null,
    resolution: body.resolution ?? null,
    duration: body.duration ?? null,
    aspect_ratio: body.aspect_ratio ?? null,
    start_image_url: body.start_image_url ?? null,
    end_image_url: body.end_image_url ?? null,
    reference_images: body.reference_images ?? null,
    reference_image_urls: body.reference_image_urls ?? null,
    reference_videos: body.reference_videos ?? null,
    reference_audios: body.reference_audios ?? null,
    shots: body.shots ?? null,
    with_audio: body.with_audio ?? null,
  });
}

export type IntentDuplicate =
  | { kind: "resume" } // mesmo intent + mesmo fingerprint → retomar a generation existente
  | { kind: "reuse_conflict" }; // mesmo intent + fingerprint DIFERENTE → 409

/** Classifica uma duplicata de intent contra a generation existente. */
export function classifyIntentDuplicate(
  existingFingerprint: string | null | undefined,
  newFingerprint: string
): IntentDuplicate {
  if (existingFingerprint && existingFingerprint === newFingerprint) return { kind: "resume" };
  return { kind: "reuse_conflict" };
}
