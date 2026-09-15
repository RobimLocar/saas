// P5g — Integração Kling Sound → status route → P5g1 storage. CLIENT REAL
// (getTaskStatus + extractResultUrls não são mockados); apenas global.fetch é
// stubado para devolver a resposta OFICIAL do Kling (4 works) e os downloads de
// mídia. Prova: 4 provider URLs → 4 uploads → result_url primary + 4 URLs INTERNAS
// em params.result_urls (nenhuma URL externa no happy path). SEM API real.

import { vi, test } from "vitest";

interface G {
  __generation?: Record<string, unknown> | null;
  __uploads?: string[];
  __updates?: Array<Record<string, unknown>>;
}
const g = globalThis as unknown as G & { fetch?: unknown };

// Boundaries mockados: Supabase (user + service-role, incl. storage) e
// credits/webhooks-drain (no-op, fora do escopo deste teste). O client PiAPI
// (getTaskStatus/extractResultUrls) e persistProviderOutputs são REAIS — é
// exatamente essa integração real que este teste prova, contra um global.fetch
// stub que devolve a resposta oficial do Kling. Zero rede real.
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
  refundCredits: async () => ({ ok: true, refunded: true }),
}));

import { GET } from "./route";

test("route.kling-integration.test.ts", async () => {

const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };

// Resposta oficial Kling (4 works, cada um com clean + watermark).
const klingWork = (i: number) => ({
  content_type: "audio",
  audio: {
    resource: `https://kling-wm/${i}.mp3`,
    resource_without_watermark: `https://kling-clean/${i}.mp3`,
  },
  cover: { resource: `https://kling/cover-${i}.png` },
});
const klingTaskJson = {
  code: 200,
  data: {
    task_id: "task-1",
    model: "kling",
    task_type: "sound",
    status: "completed",
    output: { type: "kwave_txt2audio", works: [klingWork(1), klingWork(2), klingWork(3), klingWork(4)] },
    meta: { usage: { type: "point", consume: 700000 } },
    error: { code: 0, message: "" },
  },
};

process.env.PIAPI_API_KEY = process.env.PIAPI_API_KEY || "test-key";
g.fetch = (async (url: string) => {
  const u = String(url);
  if (u.includes("/task/")) {
    // getTaskStatus (piapiFetch) — resposta JSON via .text()
    return {
      ok: true, status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/json" : null) },
      text: async () => JSON.stringify(klingTaskJson),
    };
  }
  // download de mídia
  return {
    ok: true, status: 200,
    headers: { get: () => "audio/mpeg" },
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}) as unknown;

function makeReq(id: string): Parameters<typeof GET>[0] {
  return { nextUrl: { searchParams: { get: (k: string) => (k === "id" ? id : null) } } } as unknown as Parameters<typeof GET>[0];
}

  g.__generation = {
    id: "gen-k", user_id: "user-1", type: "audio", status: "processing",
    provider_task_id: "task-1", created_at: new Date().toISOString(),
    credits_used: 4, result_url: null, params: {},
  };
  g.__uploads = [];
  g.__updates = [];

  const res = await GET(makeReq("gen-k"));
  const body = (await res.json()) as Record<string, unknown>;

  chk("status 200", res.status === 200);
  chk("response completed", body.status === "completed");
  chk("4 uploads", (g.__uploads ?? []).length === 4);
  const up = g.__uploads ?? [];
  chk("path[0] legado", up[0] === "user-1/audio/gen-k.mp3");
  chk("path[3] = -4", up[3] === "user-1/audio/gen-k-4.mp3");

  const upd = (g.__updates ?? [])[(g.__updates ?? []).length - 1] ?? {};
  chk("result_url = stored primary", upd.result_url === "https://stored/user-1/audio/gen-k.mp3");
  const rurls = (upd.params as { result_urls?: string[] })?.result_urls ?? [];
  chk("params.result_urls = 4", rurls.length === 4);
  chk("todas URLs INTERNAS (nenhuma externa Kling)", rurls.every((u) => u.startsWith("https://stored/")));
  chk("nenhuma URL de watermark/clean externa vazou", !rurls.some((u) => u.includes("kling-clean") || u.includes("kling-wm")));
  chk("response.result_urls = 4", Array.isArray(body.result_urls) && (body.result_urls as string[]).length === 4);

  if (fails.length > 0) throw new Error("kling-integration.test falhou: " + fails.join(", "));
  console.log("kling-integration.test: OK (todas as assertivas passaram)");
});
