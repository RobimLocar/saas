import { randomUUID, randomBytes } from "node:crypto";

// FLUXYRA-PRODUCTION-CLOSE-01 §1/§6/§7 — helpers de runtime da reliability (server).
// Puros e testáveis; sem I/O. O server é a AUTORIDADE do intent id, do fingerprint,
// do callback_token e da classificação de erro de submit.

/** Intervalo mínimo entre GETs de status ao provider (throttle de reconciliação). */
export const PROVIDER_POLL_INTERVAL_SECONDS = 8;

/** Janela do estado submission_unknown antes de estornar+failed (§7). */
export const SUBMISSION_UNKNOWN_WINDOW_SECONDS = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Usa o intent id do cliente se for UUID válido; senão gera um (1 intent/request). */
export function normalizeIntentId(v: unknown): string {
  return isUuid(v) ? v : randomUUID();
}

/** Token opaco e imprevisível para correlação de webhook per-task (Atlas). */
export function newCallbackToken(): string {
  return randomBytes(32).toString("base64url");
}

export type SubmitErrorClass = "definite_failure" | "ambiguous";

/**
 * Classifica um erro de submit ao provider (§7). "definite_failure" = o provider
 * REJEITOU de forma inequívoca (não há task) → seguro estornar+failed já. "ambiguous"
 * = rede/timeout/5xx/HTML/non-JSON → a task PODE ter sido criada → submission_unknown
 * (NÃO reenviar, NÃO estornar ainda; reconciliar por webhook/janela).
 */
export function classifySubmitError(err: unknown): SubmitErrorClass {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();

  // Rejeições determinísticas do provider (resposta recebida e parseada).
  const definite = [
    "insufficient credits",
    "freeze credit",
    "quota not enough",
    "account point",
    "invalid",
    "validation",
    "unsupported",
    "not allowed",
    "content moderation",
    "moderation",
    "rejected by content",
    "bad request",
    "400",
    "401",
    "403",
    "404",
    "422",
  ];
  if (definite.some((k) => msg.includes(k))) return "definite_failure";

  // Ambíguos: rede/timeout/indisponibilidade/HTML — a submissão pode ter ocorrido.
  const ambiguous = [
    "timeout",
    "timed out",
    "econnreset",
    "econnrefused",
    "socket hang up",
    "network",
    "fetch failed",
    "aborted",
    "html",
    "em vez de json",
    "non_json",
    "temporariamente indisponível",
    "502",
    "503",
    "504",
    "gateway",
    "service unavailable",
  ];
  if (ambiguous.some((k) => msg.includes(k))) return "ambiguous";

  // Default seguro: sem evidência de rejeição determinística, trate como ambíguo
  // (nunca reenvia; a janela + reconciliação resolvem). Evita cobrar por task que
  // pode ter sido criada e falso-negativos de "definite".
  return "ambiguous";
}
