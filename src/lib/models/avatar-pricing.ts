// P10a — FONTE ÚNICA (compartilhada) do custo BRUTO do Kling Avatar (task_type="avatar").
//
// Replica FIELMENTE a regra da rota de vídeo congelada (`/api/generate/video`,
// bloco `task_type === "avatar"`):
//   rate     = credit_per_second[resolução]  (SEM rebaixar silenciosamente alta-res p/ 720p)
//   segundos = duração REAL do áudio de dublagem, MEDIDA no servidor, clamp [1, 120]
//   bruto    = ceil(rate × segundos)
//   (o multiplicador de plano é aplicado FORA, UMA vez, via effectiveCost — nunca aqui.)
//
// Não há tabela de cps duplicada: o mapa `credit_per_second` vem SEMPRE do catálogo
// (ai_models.params) — tanto no servidor (débito) quanto na UI (estimativa via /api/models).
// Puro (sem dependências de servidor) para poder ser importado também no client.

export const AVATAR_MIN_SECONDS = 1;
export const AVATAR_MAX_SECONDS = 120; // teto defensivo de bilhetagem (idêntico ao vídeo)

/** Mesma normalização de segundos da rota de vídeo: ceil e clamp em [1, 120]. */
export function clampAvatarSeconds(seconds: number): number {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return AVATAR_MIN_SECONDS;
  return Math.min(Math.max(Math.ceil(s), AVATAR_MIN_SECONDS), AVATAR_MAX_SECONDS);
}

export type AvatarRateResult =
  | { ok: true; rate: number }
  | { ok: false; reason: "no_rate_high_res" };

/**
 * Resolve a tarifa (créditos/segundo) para a resolução pedida, espelhando o guard
 * da rota de vídeo: NUNCA rebaixar 1080p/2160p/4k para a tarifa 720p (sub-cobrança).
 * Se uma alta-resolução não tem tarifa configurada → bloqueio (ok:false). Resoluções
 * ≤720 mantêm o fallback histórico para "720p".
 */
export function resolveAvatarRate(
  cpsMap: Record<string, unknown> | null | undefined,
  resolution: string
): AvatarRateResult {
  const map = cpsMap && typeof cpsMap === "object" ? (cpsMap as Record<string, unknown>) : {};
  const resKey = resolution || "720p";
  const isHigh = resKey === "1080p" || resKey === "2160p" || resKey === "4k";
  if (isHigh && map[resKey] == null) {
    return { ok: false, reason: "no_rate_high_res" };
  }
  const raw = map[resKey] ?? map["720p"] ?? 0;
  const rate = Number(raw) || 0;
  return { ok: true, rate };
}

/**
 * Créditos BRUTOS (antes do multiplicador de plano) do Kling Avatar:
 *   ceil(rate × clamp(measuredSeconds)).
 * `measuredSeconds` DEVE ser a duração real do áudio (medida no servidor). NÃO aplica
 * multiplicador de plano — isso é `effectiveCost`, chamado UMA vez pelo consumidor.
 */
export function avatarRawCredits(rate: number, measuredSeconds: number): number {
  const r = Number(rate) || 0;
  if (r <= 0) return 0;
  return Math.ceil(r * clampAvatarSeconds(measuredSeconds));
}
