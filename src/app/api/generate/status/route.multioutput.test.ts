// P5g1 — Testes do /generate/status para multi-output. Runner-agnóstico
// (esbuild alias-mock). Prova: download/storage de TODOS os outputs, primary
// invariant, params.result_urls aditivo, single-output parity, idempotência de
// retry e partial failure (fallback provider, sem array incompleto). SEM API real.

import { vi, test } from "vitest";

interface G {
  __generation?: Record<string, unknown> | null;
  __state?: string;
  __providerUrls?: string[];
  __uploads?: string[];
  __updates?: Array<Record<string, unknown>>;
  __fetchUrls?: string[];
  __failFetchUrl?: string | null;
  __refunds?: Array<Record<string, unknown>>;
}
const g = globalThis as unknown as G & { fetch?: unknown };

// Boundaries mockados: Supabase (user + service-role, incl. storage), o client
// PiAPI de baixo nível (getTaskStatus/extractResultUrls, dirigido por
// __state/__providerUrls) e credits/webhooks-drain. persistProviderOutputs é
// REAL — é o all-or-nothing dele que este teste prova (mock só nos fetch/
// storage por baixo dele). Zero rede real.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: g.__generation ?? null, error: null }) }) }) }),
    }),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: g.__generation ?? null, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          (g.__updates ??= []).push(patch);
          return { data: null, error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          (g.__uploads ??= []).push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://stored/${path}` } }),
      }),
    },
  }),
}));

vi.mock("@/lib/webhooks/processor", () => ({
  drainWebhookEvents: async () => {},
}));

vi.mock("@/lib/credits", () => ({
  refundCredits: async (_service: unknown, _userId: string, _jobId: string, amount?: number) => {
    (g.__refunds ??= []).push({ amount });
    return { ok: true, refunded: true };
  },
}));

vi.mock("@/lib/piapi/client", () => ({
  getTaskStatus: async () => ({ data: { status: g.__state ?? "completed", output: {} } }),
  extractResultUrls: () => g.__providerUrls ?? [],
}));

import { GET } from "./route";

test("route.multioutput.test.ts", async () => {

const baseGeneration = (params: Record<string, unknown>) => ({
  id: "gen-1",
  user_id: "user-1",
  type: "audio",
  status: "processing",
  provider_task_id: "task-1",
  created_at: new Date().toISOString(),
  credits_used: 8,
  result_url: null,
  params,
});

const reset = (providerUrls: string[], params: Record<string, unknown> = {}): void => {
  g.__generation = baseGeneration(params);
  g.__state = "completed";
  g.__providerUrls = providerUrls;
  g.__uploads = [];
  g.__updates = [];
  g.__fetchUrls = [];
  g.__failFetchUrl = null;
};

// fetch mock (download da mídia). Lança para a URL marcada em __failFetchUrl.
g.fetch = (async (url: string) => {
  (g.__fetchUrls as string[]).push(String(url));
  if (g.__failFetchUrl && String(url) === g.__failFetchUrl) {
    throw new Error("network fail (mock)");
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => "audio/mpeg" },
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}) as unknown;

const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };

function makeReq(id: string): Parameters<typeof GET>[0] {
  return {
    nextUrl: { searchParams: { get: (k: string) => (k === "id" ? id : null) } },
  } as unknown as Parameters<typeof GET>[0];
}

function lastUpdate(): Record<string, unknown> | undefined {
  return (g.__updates ?? [])[(g.__updates ?? []).length - 1];
}

  // ── MULTI (4 outputs) ───────────────────────────────────────────────────────
  reset(["https://prov/a.mp3", "https://prov/b.mp3", "https://prov/c.mp3", "https://prov/d.mp3"]);
  const rMulti = await GET(makeReq("gen-1"));
  const bMulti = (await rMulti.json()) as Record<string, unknown>;
  chk("MULTI: status 200", rMulti.status === 200);
  chk("MULTI: 4 downloads", (g.__fetchUrls ?? []).length === 4);
  chk("MULTI: 4 uploads", (g.__uploads ?? []).length === 4);
  const upM = g.__uploads ?? [];
  chk("MULTI: path[0] legado", upM[0] === "user-1/audio/gen-1.mp3");
  chk("MULTI: path[1] = -2", upM[1] === "user-1/audio/gen-1-2.mp3");
  chk("MULTI: path[2] = -3", upM[2] === "user-1/audio/gen-1-3.mp3");
  chk("MULTI: path[3] = -4", upM[3] === "user-1/audio/gen-1-4.mp3");
  const uM = lastUpdate() ?? {};
  chk("MULTI: status completed", uM.status === "completed");
  chk("MULTI: result_url = stored primary", uM.result_url === "https://stored/user-1/audio/gen-1.mp3");
  const paramsM = uM.params as { result_urls?: string[] } | undefined;
  chk("MULTI: params.result_urls tem 4", Array.isArray(paramsM?.result_urls) && paramsM!.result_urls!.length === 4);
  chk("MULTI: result_urls[0] = primary", paramsM?.result_urls?.[0] === "https://stored/user-1/audio/gen-1.mp3");
  chk("MULTI: result_urls[3] = -4", paramsM?.result_urls?.[3] === "https://stored/user-1/audio/gen-1-4.mp3");
  chk("MULTI: response.result_urls presente", Array.isArray(bMulti.result_urls) && (bMulti.result_urls as string[]).length === 4);

  // ── PARAMS PRESERVATION ─────────────────────────────────────────────────────
  reset(
    ["https://prov/a.mp3", "https://prov/b.mp3"],
    { existing: "keep-me", pricing_version: "example" }
  );
  await GET(makeReq("gen-1"));
  const uP = (lastUpdate()?.params as Record<string, unknown>) ?? {};
  chk("PRESERVE: existing mantido", uP.existing === "keep-me");
  chk("PRESERVE: pricing_version mantido", uP.pricing_version === "example");
  chk("PRESERVE: result_urls adicionado", Array.isArray(uP.result_urls) && (uP.result_urls as string[]).length === 2);

  // ── SINGLE PARITY ───────────────────────────────────────────────────────────
  reset(["https://prov/only.mp3"], { existing: "x" });
  const rS = await GET(makeReq("gen-1"));
  const bS = (await rS.json()) as Record<string, unknown>;
  chk("SINGLE: 1 download", (g.__fetchUrls ?? []).length === 1);
  chk("SINGLE: path legado", (g.__uploads ?? [])[0] === "user-1/audio/gen-1.mp3");
  const uS = lastUpdate() ?? {};
  chk("SINGLE: result_url scalar", uS.result_url === "https://stored/user-1/audio/gen-1.mp3");
  chk("SINGLE: NÃO adiciona params (sem result_urls)", !("params" in uS));
  chk("SINGLE: response sem result_urls", !("result_urls" in bS));

  // ── IDEMPOTENT RETRY ────────────────────────────────────────────────────────
  const urls4 = ["https://prov/a.mp3", "https://prov/b.mp3", "https://prov/c.mp3", "https://prov/d.mp3"];
  reset(urls4);
  await GET(makeReq("gen-1"));
  const paths1 = [...(g.__uploads ?? [])];
  const urls1 = ((lastUpdate()?.params as { result_urls?: string[] })?.result_urls) ?? [];
  reset(urls4);
  await GET(makeReq("gen-1"));
  const paths2 = [...(g.__uploads ?? [])];
  const urls2 = ((lastUpdate()?.params as { result_urls?: string[] })?.result_urls) ?? [];
  chk("RETRY: mesmos paths", JSON.stringify(paths1) === JSON.stringify(paths2));
  chk("RETRY: nenhum output 5+", paths2.length === 4);
  chk("RETRY: 4 URLs únicas", new Set(urls2).size === 4);
  chk("RETRY: URLs estáveis entre polls", JSON.stringify(urls1) === JSON.stringify(urls2));

  // ── PARTIAL FAILURE (output 3 falha no download) ────────────────────────────
  // STALE TEST EXPECTATION CORRIGIDA (FLUXYRA-CORE-RELEASE-GATE-FINAL-01 §7):
  // esta cenário antes esperava status "completed" com fallback para a URL do
  // provider no output que falhou — isso contradiz o invariante ratificado e
  // já implementado em src/lib/media/persist-result.ts (comentário do próprio
  // arquivo: "P8a — Persistência DURÁVEL... All-or-nothing... NUNCA cai para a
  // URL temporária do provider"): QUALQUER falha de download/upload aborta a
  // persistência inteira (para no primeiro output que falha, nunca continua
  // para os seguintes) e a geração vira `failed` + estorno — nenhuma URL do
  // provider é aceita como substituto. Corrigido o TESTE para o contrato real,
  // não o runtime (que já está correto).
  reset(urls4);
  g.__failFetchUrl = "https://prov/c.mp3"; // 3º output
  const rF = await GET(makeReq("gen-1"));
  const bF = (await rF.json()) as Record<string, unknown>;
  const uF = lastUpdate() ?? {};
  chk("PARTIAL: status failed (all-or-nothing ratificado)", uF.status === "failed");
  chk("PARTIAL: error_message presente", typeof uF.error_message === "string" && (uF.error_message as string).length > 0);
  chk("PARTIAL: NÃO grava result_url", !("result_url" in uF));
  chk("PARTIAL: NÃO grava params/result_urls parcial", !("params" in uF));
  chk("PARTIAL: para no primeiro output que falha (3 downloads tentados, não 4)", (g.__fetchUrls ?? []).length === 3);
  chk("PARTIAL: só os outputs bem-sucedidos ANTES da falha são upload (2)", (g.__uploads ?? []).length === 2);
  chk("PARTIAL: refund emitido", (g.__refunds ?? []).length === 1);
  chk("PARTIAL: refund usa credits_used da geração (8)", (g.__refunds ?? [])[0]?.amount === 8);
  chk("PARTIAL: response status failed", bF.status === "failed");
  chk("PARTIAL: response sem result_url/result_urls (nenhuma URL do provider vaza)", !("result_urls" in bF) && !("result_url" in bF));

  if (fails.length > 0) {
    throw new Error("status multioutput.test falhou: " + fails.join(", "));
  }
  console.log("status multioutput.test: OK (todas as assertivas passaram)");
});
