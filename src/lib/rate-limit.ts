import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { auditLog } from "@/lib/audit-log";

// Limite de uso por usuário, contado no Postgres (RPC rate_limit_hit) para
// valer entre todas as instâncias da Vercel. Protege custo de provedores e a
// capacidade do banco contra um usuário ou robô disparando em loop.
//
// Falha ABERTA: se o contador estiver indisponível, a requisição segue (o
// débito de créditos continua sendo a trava financeira). Melhor do que
// derrubar todas as gerações por um problema no limitador.

export const RATE_LIMITS = {
  /** Geração paga (imagem, vídeo, áudio, removebg, upscale, influencer, UGC). */
  generation: { windowSeconds: 60, max: 20 },
  /** Chamadas de LLM sem cobrança de crédito (assist, storyboard, roteiro, legendas). */
  llm: { windowSeconds: 600, max: 30 },
  /** Abertura de checkout do Stripe (cartão testado em série = sinal de fraude). */
  checkout: { windowSeconds: 600, max: 10 },
  /** Upload de arquivos para o Storage. */
  upload: { windowSeconds: 600, max: 60 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

type RpcRow = { allowed: boolean; hits: number; retry_after: number };

/**
 * Conta uma chamada do usuário no balde. Devolve uma resposta 429 pronta quando
 * o limite estoura, ou null quando pode seguir.
 */
export async function enforceRateLimit(
  userId: string,
  bucket: RateLimitBucket,
  requestId = "-"
): Promise<NextResponse | null> {
  const { windowSeconds, max } = RATE_LIMITS[bucket];
  try {
    const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
      p_key: `${bucket}:${userId}`,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
    if (!row || row.allowed) return null;

    auditLog("rate_limit", "bloqueado_429", requestId, { user_id: userId, bucket, hits: row.hits, max });
    const retryAfter = Math.max(1, row.retry_after || windowSeconds);
    return NextResponse.json(
      {
        error: `Muitas solicitações em pouco tempo. Aguarde ${retryAfter}s e tente de novo.`,
        retry_after: retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  } catch (err) {
    auditLog("rate_limit", "indisponivel_fail_open", requestId, {
      bucket,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
