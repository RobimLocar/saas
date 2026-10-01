// Limite de uso: 429 com Retry-After quando estoura, segue quando cabe, e
// falha aberta se o contador do banco estiver indisponível. Sem banco real.
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as unknown as {
  __rl: { data: unknown; error: { message: string } | null; calls: Array<Record<string, unknown>> };
};
g.__rl = { data: null, error: null, calls: [] };

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      g.__rl.calls.push(args);
      return { data: g.__rl.data, error: g.__rl.error };
    },
  }),
}));

import { enforceRateLimit, RATE_LIMITS } from "./rate-limit";

describe("enforceRateLimit", () => {
  beforeEach(() => {
    g.__rl = { data: null, error: null, calls: [] };
  });

  it("dentro do limite: segue (null) e conta na chave do usuário e balde", async () => {
    g.__rl.data = [{ allowed: true, hits: 3, retry_after: 40 }];
    expect(await enforceRateLimit("u1", "generation")).toBeNull();
    expect(g.__rl.calls[0]).toEqual({
      p_key: "generation:u1",
      p_window_seconds: RATE_LIMITS.generation.windowSeconds,
      p_max: RATE_LIMITS.generation.max,
    });
  });

  it("acima do limite: 429 com Retry-After e mensagem para o usuário", async () => {
    g.__rl.data = [{ allowed: false, hits: 21, retry_after: 37 }];
    const res = await enforceRateLimit("u1", "generation");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("37");
    const body = (await res?.json()) as { error: string; retry_after: number };
    expect(body.retry_after).toBe(37);
    expect(body.error).toMatch(/Aguarde 37s/);
  });

  it("aceita retorno do RPC como objeto único", async () => {
    g.__rl.data = { allowed: false, hits: 11, retry_after: 0 };
    const res = await enforceRateLimit("u2", "checkout");
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });

  it("contador indisponível: falha aberta (não bloqueia geração)", async () => {
    g.__rl.error = { message: "db down" };
    expect(await enforceRateLimit("u1", "generation")).toBeNull();
  });
});
