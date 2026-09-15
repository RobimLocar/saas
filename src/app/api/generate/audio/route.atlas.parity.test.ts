// P4h/P5b/P5d1b — Parity test do BRANCH ATLAS da Audio route (ROUTE → REGISTER →
// REGISTRY → ATLAS ADAPTER → MOCK ATLAS CLIENT). NÃO chama APIs reais.
// Runner-agnóstico (esbuild alias-mock). Cobre:
//   • P4h: fluxo Atlas, URL, persist, DB completed sem provider_task_id, order.
//   • P5b: params NÃO grava similarity/speed; request legado ignorado.
//   • P5d1b: billing por caractere (per_kchar) — custo dinâmico, metadata de
//     auditoria, 402 quando saldo < custo dinâmico, refund do valor cobrado,
//     call Atlas do provider INALTERADA (text/voice/model/stability).

import { vi, test } from "vitest";

interface G {
  __atlasCalls?: Array<{ args: unknown }>;
  __generateAudioCalls?: number;
  __dbUpdates?: Array<{ table: string; patch: Record<string, unknown> }>;
  __inserts?: Array<{ table: string; payload: Record<string, unknown> }>;
  __order?: string[];
  __billing?: Array<Record<string, unknown>>;
  __fetchUrls?: string[];
  __atlasMode?: string;
  __balance?: number;
}
const g = globalThis as unknown as G & { fetch?: unknown };

// Boundaries mockados: Supabase (user + service-role clients, incl. storage),
// credits, tts-voices (resolveAtlasVoice — sentinela determinístico) e o
// client Atlas de baixo nível. Registry + adapter Atlas REAIS orquestram no
// meio; tts-pricing (matemática pura) roda REAL para provar o billing por
// caractere de verdade. Zero rede real: fetch global também é stub.
function makeQuery(table: string) {
  const resolveSingle = async () => {
    if (table === "ai_models") {
      return {
        data: {
          id: "model-1",
          model_id: "atlas-elevenlabs-v3",
          credit_cost: 4,
          min_plan: "free",
          params: {
            backend: "atlas-tts",
            kind: "tts",
            atlas_model: "elevenlabs/v3/text-to-speech",
            billing_mode: "per_kchar",
            base_credits_per_kchar: 12,
            provider_price_per_kchar_usd: 0.1,
            pricing_version: "atlas-elevenlabs-v3-kchar-v1",
          },
        },
        error: null,
      };
    }
    if (table === "profiles") {
      return { data: { credits_balance: g.__balance ?? 1000, plan: "free" }, error: null };
    }
    return { data: null, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    gt: () => q,
    lt: () => q,
    order: () => q,
    limit: () => q,
    single: resolveSingle,
    maybeSingle: resolveSingle,
    insert: (row: Record<string, unknown>) => {
      (g.__inserts ??= []).push({ table, payload: row });
      return {
        select: () => ({
          single: async () => ({ data: { id: "gen-audio-1", ...row }, error: null }),
        }),
      };
    },
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        (g.__dbUpdates ??= []).push({ table, patch });
        if (patch.status === "completed") (g.__order ??= []).push("db-completed");
        return { data: null, error: null };
      },
    }),
  };
  return q;
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => makeQuery(table),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://storage.test/audio/final.wav" } }),
      }),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => makeClient() }));

vi.mock("@/lib/tts-voices", () => ({
  resolveAtlasVoice: (voiceId?: string) => `voice-resolved:${voiceId}`,
}));

vi.mock("@/lib/credits", () => ({
  effectiveCost: (baseCost: number) => {
    (g.__order ??= []).push("cost");
    return baseCost;
  },
  debitCredits: async (_service: unknown, _userId: string, amount: number) => {
    (g.__order ??= []).push("debit");
    (g.__billing ??= []).push({ debit: [amount], amount });
    return { ok: true, balance: 970 };
  },
  refundCredits: async (_service: unknown, _userId: string, _jobId: string, amount?: number) => {
    (g.__order ??= []).push("refund");
    (g.__billing ??= []).push({ refund: true, amount });
    return { ok: true, refunded: true };
  },
}));

vi.mock("@/lib/atlas/client", () => {
  class AtlasError extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = "AtlasError";
    }
  }
  return {
    AtlasError,
    generateSpeechAtlas: async (args: unknown) => {
      (g.__atlasCalls ??= []).push({ args });
      (g.__order ??= []).push("atlas-submit");
      if (g.__atlasMode === "throw402") {
        throw new AtlasError("Saldo Atlas insuficiente.", 402);
      }
      return "https://atlas.test/generated.wav";
    },
  };
});

vi.mock("@/lib/piapi/client", () => ({
  buildVideoPayload: (args: unknown) => args,
  submitVideoTask: async () => ({ data: { task_id: "vid1", status: "pending" } }),
  generateImage: async () => ({ data: { task_id: "img_gen", status: "pending" } }),
  submitQwenImageTask: async () => ({ data: { task_id: "img_qwen", status: "pending" } }),
  submitGeminiImageTask: async () => ({ data: { task_id: "img_gem", status: "pending" } }),
  submitImageToolkitTask: async () => ({ data: { task_id: "img_tk", status: "pending" } }),
  generateImageGptSync: async () => "https://cdn/gptsync.png",
  generateImageGptEdits: async () => "https://cdn/gptedits.png",
  generateAudio: async () => {
    g.__generateAudioCalls = (g.__generateAudioCalls ?? 0) + 1;
    return { data: { task_id: "aud1", status: "pending" } };
  },
  getTaskStatus: async () => ({ data: { status: "completed", output: {}, meta: {} } }),
  extractResultUrls: () => [],
  extractVideoUrl: () => undefined,
}));

import { POST } from "./route";

test("route.atlas.parity.test.ts", async () => {

const reset = (): void => {
  g.__atlasCalls = []; g.__generateAudioCalls = 0; g.__dbUpdates = []; g.__inserts = [];
  g.__order = []; g.__billing = []; g.__fetchUrls = []; g.__atlasMode = "ok"; g.__balance = 1000;
};

function insertedParams(): Record<string, unknown> | undefined {
  const ins = (g.__inserts ?? []).find((i) => i.table === "generations");
  return ins?.payload.params as Record<string, unknown> | undefined;
}

g.fetch = (async (url: string) => {
  (g.__fetchUrls as string[]).push(String(url));
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
}) as unknown;

const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };
function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

// Prompt determinístico: 2500 chars ASCII → base = ceil(2500/1000 × 12) = 30.
// effectiveCost é mockado como identidade no harness → cobrança = 30.
const TEXT_2500 = "a".repeat(2500);

  // ── HAPPY PATH (Atlas + per_kchar dinâmico) ─────────────────────────────────
  reset();
  const res = await POST(makeReq({ prompt: TEXT_2500, model_uuid: "m1", voice_id: "v1", stability: 0.7 }));
  const body = (await res.json()) as Record<string, unknown>;

  chk("happy status 200", res.status === 200);
  chk("response.status completed", body.status === "completed");
  chk("response.generation_id", body.generation_id === "gen-audio-1");
  chk("response.result_url persistida", body.result_url === "https://storage.test/audio/final.wav");
  chk("P5d1b: credits_used dinâmico = 30", body.credits_used === 30);
  chk("sem campos externos novos", !("provider" in body) && !("canonicalId" in body) && !("requestId" in body) && !("providerTaskId" in body) && !("submission" in body));

  // Atlas client — call do provider INALTERADA (billing não muda o payload).
  const calls = g.__atlasCalls ?? [];
  chk("generateSpeechAtlas 1x", calls.length === 1);
  const a = calls[0]?.args as { text?: string; voice?: string; model?: string; stability?: number } | undefined;
  chk("call.text", a?.text === TEXT_2500);
  chk("call.voice resolvida", a?.voice === "voice-resolved:v1");
  chk("call.model", a?.model === "elevenlabs/v3/text-to-speech");
  chk("call.stability", a?.stability === 0.7);
  chk("call chaves exatas", a !== undefined && Object.keys(a).sort().join(",") === "model,stability,text,voice");

  chk("generateAudio NÃO chamado", (g.__generateAudioCalls ?? -1) === 0);
  chk("fetch da URL do Atlas", (g.__fetchUrls ?? []).includes("https://atlas.test/generated.wav"));

  const completed = (g.__dbUpdates ?? []).find((u) => u.patch.status === "completed");
  chk("DB completed", completed !== undefined);
  chk("DB result_url", completed?.patch.result_url === "https://storage.test/audio/final.wav");
  chk("DB NÃO grava provider_task_id", completed !== undefined && !("provider_task_id" in completed.patch));

  const o = g.__order ?? [];
  chk("ordem cost<debit", o.indexOf("cost") >= 0 && o.indexOf("cost") < o.indexOf("debit"));
  chk("ordem debit<atlas-submit", o.indexOf("debit") < o.indexOf("atlas-submit"));
  chk("ordem atlas-submit<db-completed", o.indexOf("atlas-submit") < o.indexOf("db-completed"));

  // P5d1b — metadata de auditoria persistida no INSERT.
  const p = insertedParams();
  chk("meta character_count=2500", p?.character_count === 2500);
  chk("meta base_credits=30", p?.base_credits === 30);
  chk("meta charged_credits=30", p?.charged_credits === 30);
  chk("meta pricing_version", p?.pricing_version === "atlas-elevenlabs-v3-kchar-v1");
  chk("meta provider_list_price_usd_estimate≈0.25", typeof p?.provider_list_price_usd_estimate === "number" && Math.abs((p!.provider_list_price_usd_estimate as number) - 0.25) < 1e-9);
  // P5b — stability presente; similarity/speed ausentes.
  chk("P5b: params stability", p?.stability === 0.7);
  chk("P5b: params SEM similarity", p !== undefined && !("similarity" in p));
  chk("P5b: params SEM speed", p !== undefined && !("speed" in p));

  // ── LEGACY REQUEST (similarity/speed ignorados) ─────────────────────────────
  reset();
  const resL = await POST(makeReq({ prompt: TEXT_2500, model_uuid: "m1", voice_id: "v1", stability: 0.7, similarity: 0.9, speed: 2.0 }));
  const bodyL = (await resL.json()) as Record<string, unknown>;
  chk("legacy 200 completed", resL.status === 200 && bodyL.status === "completed" && bodyL.credits_used === 30);
  const aL = (g.__atlasCalls ?? [])[0]?.args as Record<string, unknown> | undefined;
  chk("legacy: Atlas call chaves exatas", aL !== undefined && Object.keys(aL).sort().join(",") === "model,stability,text,voice");
  const pL = insertedParams();
  chk("legacy: params SEM similarity/speed", pL !== undefined && !("similarity" in pL) && !("speed" in pL));

  // ── 402: saldo < custo dinâmico ─────────────────────────────────────────────
  reset();
  g.__balance = 5; // < 30
  const res402 = await POST(makeReq({ prompt: TEXT_2500, model_uuid: "m1", voice_id: "v1", stability: 0.5 }));
  const body402 = (await res402.json()) as Record<string, unknown>;
  chk("402 status", res402.status === 402);
  chk("402 required=30 (custo dinâmico)", body402.required === 30);
  chk("402 generateSpeechAtlas 0x", (g.__atlasCalls ?? []).length === 0);
  chk("402 sem debit", !(g.__order ?? []).includes("debit"));
  chk("402 sem db-completed", !(g.__dbUpdates ?? []).some((u) => u.patch.status === "completed"));

  // ── LIMITE 5000: 5001 chars → 400 antes de insert/debit/provider ────────────
  reset();
  const res400 = await POST(makeReq({ prompt: "b".repeat(5001), model_uuid: "m1", voice_id: "v1", stability: 0.5 }));
  chk("5001 chars → 400", res400.status === 400);
  chk("5001 sem atlas", (g.__atlasCalls ?? []).length === 0);
  chk("5001 sem debit", !(g.__order ?? []).includes("debit"));

  // ── FAILURE (AtlasError 402) → refund do valor cobrado (dinâmico) ───────────
  reset();
  g.__atlasMode = "throw402";
  const res2 = await POST(makeReq({ prompt: TEXT_2500, model_uuid: "m1", voice_id: "v1", stability: 0.5 }));
  const body2 = (await res2.json()) as Record<string, unknown>;
  chk("erro status 402 (AtlasError)", res2.status === 402);
  chk("erro message preservada", typeof body2.error === "string" && (body2.error as string).length > 0);
  chk("atlas submit tentado", (g.__atlasCalls ?? []).length === 1);
  const refund = (g.__billing ?? []).find((b) => "refund" in b);
  chk("refund após falha", refund !== undefined);
  chk("refund usa valor cobrado (30)", refund?.amount === 30);
  const o2 = g.__order ?? [];
  chk("ordem debit<atlas-submit<refund", o2.indexOf("debit") < o2.indexOf("atlas-submit") && o2.indexOf("atlas-submit") < o2.indexOf("refund"));

  if (fails.length > 0) {
    throw new Error("audio atlas parity.test falhou: " + fails.join(", "));
  }
  console.log("audio atlas parity.test: OK (todas as assertivas passaram)");
});
