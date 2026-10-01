/**
 * Logging estruturado da auditoria forense — Fluxyra.
 * Emite 1 linha JSON por evento no stdout (anexado em logs/app.log pelo systemd).
 * Formato: {ts, scope, event, requestId, ms?, data}
 * NUNCA logar secrets: use maskSecret() para Authorization/x-api-key/tokens.
 */

import { randomUUID } from "node:crypto";

export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

/** Mascara um secret mantendo apenas os 4 primeiros e 4 últimos caracteres. */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return "<vazio>";
  if (value.length <= 10) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)} (len=${value.length})`;
}

/** Trunca strings muito longas (ex.: data-URLs base64) para não poluir o log. */
export function truncate(value: unknown, max = 2000): unknown {
  if (typeof value === "string" && value.length > max) {
    return `${value.slice(0, max)}...<truncado ${value.length - max} chars>`;
  }
  return value;
}

// Campos cujo VALOR nunca pode ir para o log, em qualquer nível do objeto.
// Ex.: config.webhook_config.secret da PiAPI ia em texto aberto para a Vercel
// dentro do body da request e da resposta de getTaskStatus.
const SENSITIVE_KEY =
  /^(secret|webhook_secret|client_secret|api[-_]?key|x-api-key|authorization|password|access_token|refresh_token|callback_token|token)$/i;
const REDACTED = "[redacted]";

/** Mascara valores sensíveis dentro de texto (JSON serializado ou URL). */
function redactText(text: string): string {
  return text
    .replace(
      /("(?:secret|webhook_secret|client_secret|api[-_]?key|x-api-key|authorization|password|access_token|refresh_token|callback_token|token)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
      `$1"${REDACTED}"`
    )
    // Token do callback por task da Atlas vai no path do webhook_url.
    .replace(/(\/api\/webhooks\/atlas\/)[^/"?\s]+/g, `$1${REDACTED}`);
}

/** Cópia do valor com todos os segredos mascarados (objetos, arrays e texto). */
export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > 12) return value;
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // x-api-key já chega mascarado por maskSecret(); mantém a forma "e63a...c959".
      if (SENSITIVE_KEY.test(k) && !(typeof v === "string" && /^\S{4}\.\.\.\S{4} \(len=\d+\)$/.test(v))) {
        out[k] = v == null || v === "" ? v : REDACTED;
      } else {
        out[k] = redactSecrets(v, depth + 1);
      }
    }
    return out as T;
  }
  return value;
}

export function auditLog(
  scope: string,
  event: string,
  requestId: string,
  data?: Record<string, unknown>,
  ms?: number
): void {
  const line = {
    ts: new Date().toISOString(),
    scope,
    event,
    requestId,
    ...(typeof ms === "number" ? { ms: Math.round(ms) } : {}),
    ...(data ? { data: redactSecrets(data) } : {}),
  };
  try {
    console.log(`[FLUXYRA-AUDIT] ${JSON.stringify(line)}`);
  } catch {
    console.log(`[FLUXYRA-AUDIT] {"ts":"${line.ts}","scope":"${scope}","event":"${event}","requestId":"${requestId}","data":"<não serializável>"}`);
  }
}
