// P11a — ADAPTER Atlas: liga CONTRACT PROFILE ao TRANSPORTE genérico.
// Ponto ÚNICO que as rotas de produto chamam quando params.runtime_provider="atlas".
// A rota só passa `input` com os campos que já aceita; o profile faz a allowlist +
// validação. `atlasModel`/`contractId` vêm do catálogo (server-trusted).

import {
  submitAtlasImage,
  submitAtlasVideo,
  submitAtlasAudio,
  getAtlasPrediction,
  type AtlasPrediction,
  type AtlasSubmitResult,
} from "./client";
import { getAtlasContract, type AtlasContractId, type AtlasOutputKind } from "./profiles";

/** Modo → contrato de vídeo (cada modo tem shape de payload própria). Exportado p/ certificação. */
export function videoContractForMode(mode: string | undefined): AtlasContractId | null {
  switch (mode) {
    case "text-to-video":
      return "video-basic";
    case "image-to-video":
    case "video-edit":
    case "video-extend":
      return "video-image";
    case "start-end-frame":
      return "video-start-end";
    case "reference-to-video":
      return "video-reference-images";
    default:
      return null; // usa o contrato default do row
  }
}

/**
 * Resolve o atlas_model CONFIÁVEL pelo modo (server-controlled). O browser nunca
 * envia model id arbitrário — só o `mode`, validado contra params.modes.
 */
export function resolveAtlasModelForMode(
  atlasModel: string | null | undefined,
  atlasModelsByMode: Record<string, string> | null | undefined,
  mode: string | undefined
): string | null {
  if (atlasModelsByMode && mode && typeof atlasModelsByMode[mode] === "string") {
    return atlasModelsByMode[mode];
  }
  return atlasModel ?? null;
}

export interface AtlasFieldTransform {
  /** Renomeia campos canônicos → provider (ex.: {image_url:"image", end_image_url:"last_image"}). */
  fieldMap?: Record<string, string> | null;
  /** Campo destino do array de referências (ex.: Grok = "image_urls"; default "refers"). */
  refersField?: string | null;
  /** Envolve cada referência como objeto {url} (ex.: MiniMax H3 = refers:[{url}]). */
  refersAsObjects?: boolean;
}

/**
 * COMPETITOR-VIDEO-04 — transform EXPLÍCITO por modelo: o profile monta o body
 * CANÔNICO; aqui renomeamos/reformatamos para o contrato EXATO do provider. Puro.
 */
export function applyAtlasFieldMap(
  body: Record<string, unknown>,
  t: AtlasFieldTransform
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if (t.fieldMap) {
    for (const [from, to] of Object.entries(t.fieldMap)) {
      if (from !== to && Object.prototype.hasOwnProperty.call(out, from)) {
        out[to] = out[from];
        delete out[from];
      }
    }
  }
  if (Array.isArray(out.refers)) {
    let refs: unknown[] = out.refers as unknown[];
    if (t.refersAsObjects) refs = (refs as string[]).map((u) => ({ url: u }));
    const target = t.refersField || "refers";
    if (target !== "refers") {
      out[target] = refs;
      delete out.refers;
    } else {
      out.refers = refs;
    }
  }
  return out;
}

export interface AtlasDispatchResult {
  ok: boolean;
  predictionId: string | null;
  pollRef: string | null;
  immediateOutputs: string[];
  outputKind: AtlasOutputKind;
  error: string | null;
}

/** Runtime provider explícito (opt-in) — nunca inferido de metadata stale. */
export function isAtlasRuntime(params: Record<string, unknown> | null | undefined): boolean {
  return !!params && (params as Record<string, unknown>).runtime_provider === "atlas";
}

export async function submitAtlasGeneration(opts: {
  contractId: string | undefined | null;
  atlasModel: string | undefined | null;
  input: Record<string, unknown>;
  /** Modo selecionado (server-validado). Ajusta model id + contrato quando aplicável. */
  mode?: string;
  atlasModelsByMode?: Record<string, string> | null;
  /** Transform EXATO por modelo (renames/reformat) aplicado ao body canônico. */
  transform?: AtlasFieldTransform | null;
  /** Callback per-task (`.../api/webhooks/atlas/<token>`) — completion sem depender do browser. */
  webhookUrl?: string | null;
}): Promise<AtlasDispatchResult> {
  // Modo troca o model id CONFIÁVEL e (p/ vídeo) o contrato (i2v exige image input).
  const resolvedModel = resolveAtlasModelForMode(opts.atlasModel, opts.atlasModelsByMode, opts.mode);
  const modeContract = videoContractForMode(opts.mode);
  const contractId = modeContract && getAtlasContract(opts.contractId)?.endpoint === "generateVideo"
    ? modeContract
    : opts.contractId;
  const profile = getAtlasContract(contractId);
  const base = {
    ok: false,
    predictionId: null,
    pollRef: null,
    immediateOutputs: [] as string[],
    outputKind: (profile?.outputKind ?? "media") as AtlasOutputKind,
    error: null as string | null,
  };
  if (!profile) return { ...base, error: `Contrato Atlas desconhecido: ${contractId}` };
  if (!resolvedModel) return { ...base, error: "atlas_model ausente na configuração do modelo" };

  const built = profile.buildBody(resolvedModel, opts.input);
  if (!built.ok) return { ...base, error: built.error };

  // Transform EXATO por modelo (canônico → contrato do provider).
  const finalBody = opts.transform ? applyAtlasFieldMap(built.body, opts.transform) : { ...built.body };
  // Callback per-task para completion via webhook (Predictions continua como fallback).
  if (opts.webhookUrl) finalBody.webhook_url = opts.webhookUrl;

  let res: AtlasSubmitResult;
  if (profile.endpoint === "generateImage") res = await submitAtlasImage(finalBody);
  else if (profile.endpoint === "generateVideo") res = await submitAtlasVideo(finalBody);
  else res = await submitAtlasAudio(finalBody);

  return {
    ok: res.ok,
    predictionId: res.predictionId,
    pollRef: res.pollRef,
    immediateOutputs: res.immediateOutputs,
    outputKind: profile.outputKind,
    error: res.error,
  };
}

/** Poll compartilhado (a rota /api/generate/status chama isto quando Atlas). */
export function pollAtlasGeneration(pollRef: string): Promise<AtlasPrediction> {
  return getAtlasPrediction(pollRef);
}
