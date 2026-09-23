import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * GROWTH-02 — Entitlement do teste grátis (1 imagem por e-mail, GLOBAL no SaaS).
 *
 * NÃO é crédito. Estados: available → claimed → used. Fonte da verdade = tabela
 * public.free_image_trials + RPCs atômicas (migration 20260907120000), acessadas
 * SOMENTE via service-role (browser não controla nada disto).
 *
 * ⚠ DEPLOYMENT COUPLING: exige a migration aplicada. Sem as RPCs, `claim` retorna
 * ok:false (fail-closed) → o trial fica dormente e o usuário cai em "recarregar".
 * Nunca concede imagem grátis sem o claim atômico ter sucedido.
 */

/** Identidade do trial: trim + lowercase (autoritativo também dentro da RPC). */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export type TrialStatus = "available" | "claimed" | "used" | "unknown";

/**
 * Claim ATÔMICO do entitlement. Retorna `{ ok, claimed }`.
 *  - claimed:true  → este request reservou o trial (pode gerar a imagem grátis);
 *  - claimed:false → negado (já usado, ou claim recente em voo);
 *  - ok:false      → RPC indisponível/erro (fail-closed: tratar como negado).
 */
export async function claimFreeImageTrial(
  service: SupabaseClient,
  email: string | null | undefined,
  userId: string,
  generationId: string
): Promise<{ ok: boolean; claimed: boolean }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: true, claimed: false };
  const { data, error } = await service.rpc("claim_free_image_trial", {
    p_email: normalized,
    p_user_id: userId,
    p_generation_id: generationId,
  });
  if (error) return { ok: false, claimed: false };
  return { ok: true, claimed: data === "claimed" };
}

/** Libera o trial (falha/timeout) — no-op se já 'used' ou não pertencer à geração. */
export async function releaseFreeImageTrial(
  service: SupabaseClient,
  generationId: string
): Promise<void> {
  await service.rpc("release_free_image_trial", { p_generation_id: generationId });
}

/** Marca o trial como USED permanentemente (sucesso durável). */
export async function markFreeImageTrialUsed(
  service: SupabaseClient,
  generationId: string
): Promise<void> {
  await service.rpc("mark_free_image_trial_used", { p_generation_id: generationId });
}

/**
 * Status do trial do e-mail informado (derivado da SESSÃO no chamador — nunca de
 * um e-mail vindo do browser, para evitar enumeração). Leitura service-role.
 * Retorna 'unknown' se a tabela/RPC ainda não existir (pré-migration).
 */
export async function getFreeImageTrialStatus(
  service: SupabaseClient,
  email: string | null | undefined
): Promise<TrialStatus> {
  const normalized = normalizeEmail(email);
  if (!normalized) return "unknown";
  const { data, error } = await service
    .from("free_image_trials")
    .select("status")
    .eq("normalized_email", normalized)
    .maybeSingle();
  if (error) return "unknown";
  if (!data) return "available"; // sem linha = nunca usou = disponível
  const s = (data as { status?: string }).status;
  return s === "used" || s === "claimed" || s === "available" ? s : "unknown";
}
