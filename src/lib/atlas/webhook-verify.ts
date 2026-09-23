import { verify as edVerify, createPublicKey, type JsonWebKey as CryptoJwk } from "node:crypto";

// VIDEO-RELIABILITY-IMPLEMENT-01 — Verificação oficial do webhook Atlas (Ed25519/JWKS).
// Contrato: assinatura Ed25519 sobre EXATAMENTE `${X-AtlasCloud-Webhook-Timestamp}.${raw_body}`
// (bytes crus — NÃO fazer JSON.parse antes de verificar). Chave pública via JWKS por kid.
// Replay window ~5 min. Falha → fail-closed. NÃO implementa HMAC legado (nova integração).

const REPLAY_SECONDS_DEFAULT = 300;

export interface AtlasVerifyResult {
  ok: boolean;
  reason?: string;
}

/** Verificação Ed25519 pura (testável): message bytes + assinatura base64(url) + JWK público. */
export function verifyEd25519(message: Buffer, signatureB64: string, publicJwk: CryptoJwk): boolean {
  try {
    const normalized = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
    const sig = Buffer.from(normalized, "base64");
    const keyObject = createPublicKey({ key: publicJwk, format: "jwk" });
    return edVerify(null, message, keyObject, sig);
  } catch {
    return false;
  }
}

// Cache de JWKS por kid (módulo). Atlas rotaciona → re-fetch em kid desconhecido.
const jwksCache = new Map<string, CryptoJwk>();

export type JwkResolver = (kid: string) => Promise<CryptoJwk | null>;

/**
 * Verifica um webhook Atlas. `getJwk` resolve a chave por kid (injetável em teste;
 * em produção busca a JWKS e cacheia). Retorna {ok,reason}; qualquer falha = fail-closed.
 */
export async function verifyAtlasWebhook(opts: {
  rawBody: Buffer;
  timestampHeader: string | null;
  signatureHeader: string | null; // X-AtlasCloud-Webhook-Signature-Ed25519
  kid: string | null; // X-AtlasCloud-Webhook-Key-Id
  getJwk: JwkResolver;
  now?: number;
  replaySeconds?: number;
}): Promise<AtlasVerifyResult> {
  const { rawBody, timestampHeader, signatureHeader, kid } = opts;
  if (!timestampHeader || !signatureHeader || !kid) {
    return { ok: false, reason: "headers ausentes" };
  }
  // Replay window: timestamp é epoch (s ou ms) coberto pela assinatura.
  const tsNum = Number(timestampHeader);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "timestamp inválido" };
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
  const now = opts.now ?? Date.now();
  const replayMs = (opts.replaySeconds ?? REPLAY_SECONDS_DEFAULT) * 1000;
  if (Math.abs(now - tsMs) > replayMs) return { ok: false, reason: "timestamp fora da janela (replay)" };

  // Mensagem assinada = `${timestamp}.${raw_body}` (bytes crus).
  const message = Buffer.concat([Buffer.from(`${timestampHeader}.`, "utf8"), rawBody]);

  let jwk = jwksCache.get(kid) ?? null;
  if (!jwk) {
    jwk = await opts.getJwk(kid); // re-fetch em kid desconhecido
    if (jwk) jwksCache.set(kid, jwk);
  }
  if (!jwk) return { ok: false, reason: "kid desconhecido" };

  if (!verifyEd25519(message, signatureHeader, jwk)) return { ok: false, reason: "assinatura inválida" };
  return { ok: true };
}

/** Limpa o cache de JWKS (uso em teste). */
export function _clearAtlasJwksCache(): void {
  jwksCache.clear();
}
