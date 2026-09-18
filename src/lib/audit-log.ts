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
    ...(data ? { data } : {}),
  };
  try {
    console.log(`[FLUXYRA-AUDIT] ${JSON.stringify(line)}`);
  } catch {
    console.log(`[FLUXYRA-AUDIT] {"ts":"${line.ts}","scope":"${scope}","event":"${event}","requestId":"${requestId}","data":"<não serializável>"}`);
  }
}
