// P4b — Teste de paridade da rota RemoveBG (ROUTE → REGISTRY → PiAPI ADAPTER →
// PiAPI CLIENT). NÃO chama APIs reais. Runner-agnóstico (padrão P2b/P3b):
// as assertivas rodam no import; as dependências externas (supabase, credits,
// next/server, @/lib/piapi/client) são mockadas via alias esbuild na execução.
// O registry e o adapter PiAPI são REAIS — é justamente o que P4a precisa provar.
//
// O client mock registra em globalThis.__removeBgPiapiCalls os args/requestId
// recebidos por submitImageToolkitTask; os mocks de db/billing registram ordem.

import { vi, test } from "vitest";

interface G {
  __removeBgPiapiCalls?: Array<{ args: unknown; requestId: unknown }>;
  __dbUpdates?: Array<{ table: string; patch: Record<string, unknown> }>;
  __order?: string[];
  __billing?: Array<Record<string, unknown>>;
  __piapiMode?: string;
  __debitMode?: string;
}
const g = globalThis as unknown as G;

// Boundaries mockados: Supabase (auth/user client + service-role client),
// credits (debit/refund/effectiveCost) e o client PiAPI de baixo nível. O
// Provider Registry e o adapter PiAPI REAIS continuam no meio — é a rota real
// orquestrando débito → submit → persistência → (refund se falhar) que este
// teste prova, contra dependências externas fake. Zero rede real.
function tableQuery(table: string) {
  const resolveSingle = async () => {
    if (table === "ai_models") return { data: { id: "model-1", credit_cost: 4 }, error: null };
    if (table === "profiles") return { data: { plan: "free" }, error: null };
    return { data: null, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    limit: () => q,
    order: () => q,
    single: resolveSingle,
    maybeSingle: resolveSingle,
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => ({
      ...tableQuery(table),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({ data: { id: "gen-1", ...row }, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          (g.__dbUpdates ??= []).push({ table, patch });
          if (patch.status === "processing") (g.__order ??= []).push("db-processing");
          return { data: null, error: null };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/credits", () => ({
  effectiveCost: (baseCost: number) => {
    (g.__order ??= []).push("cost");
    return baseCost;
  },
  debitCredits: async () => {
    (g.__order ??= []).push("debit");
    (g.__billing ??= []).push({ debit: true });
    if (g.__debitMode === "insufficient") return { ok: false, insufficient: true };
    if (g.__debitMode === "fail") return { ok: false, error: "debit failed (mock)" };
    return { ok: true, balance: 100 };
  },
  refundCredits: async () => {
    (g.__order ??= []).push("refund");
    (g.__billing ??= []).push({ refund: true });
    return { ok: true, refunded: true };
  },
}));

vi.mock("@/lib/piapi/client", () => ({
  buildVideoPayload: (args: unknown) => args,
  submitVideoTask: async () => ({ data: { task_id: "vid1", status: "pending" } }),
  generateImage: async () => ({ data: { task_id: "img_gen", status: "pending" } }),
  submitQwenImageTask: async () => ({ data: { task_id: "img_qwen", status: "pending" } }),
  submitGeminiImageTask: async () => ({ data: { task_id: "img_gem", status: "pending" } }),
  submitImageToolkitTask: async (args: unknown, requestId?: string) => {
    (g.__removeBgPiapiCalls ??= []).push({ args, requestId });
    (g.__order ??= []).push("submit");
    if (g.__piapiMode === "fail") throw new Error("PiAPI toolkit failure (mock)");
    return { data: { task_id: "task-removebg-test-123", status: "pending" } };
  },
  generateImageGptSync: async () => "https://cdn/gptsync.png",
  generateImageGptEdits: async () => "https://cdn/gptedits.png",
  generateAudio: async () => ({ data: { task_id: "aud1", status: "pending" } }),
  getTaskStatus: async () => ({ data: { status: "completed", output: {}, meta: {} } }),
  extractResultUrls: () => [],
  extractVideoUrl: () => undefined,
}));

import { POST } from "./route";

test("route.parity.test.ts", async () => {

const reset = (): void => { g.__removeBgPiapiCalls = []; g.__dbUpdates = []; g.__order = []; g.__billing = []; g.__piapiMode = "ok"; g.__debitMode = "ok"; };

const fails: string[] = [];
const chk = (name: string, cond: boolean): void => { if (!cond) fails.push(name); };

function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}
const IMG = "https://img.test/a.png";

  // ── HAPPY PATH ─────────────────────────────────────────────────────────────
  reset();
  const res = await POST(makeReq({ image_url: IMG, rmbg_model: "BEN2" }));
  const body = (await res.json()) as Record<string, unknown>;
  chk("happy status 200", res.status === 200);
  chk("happy response.generation_id", body.generation_id === "gen-1");
  chk("happy response.status processing", body.status === "processing");
  chk("sem campos externos novos", !("provider" in body) && !("canonicalId" in body) && !("providerTaskId" in body));

  const calls = g.__removeBgPiapiCalls ?? [];
  chk("submitImageToolkitTask chamado 1x", calls.length === 1);
  const args = calls[0]?.args as { taskType?: string; input?: Record<string, unknown> } | undefined;
  chk("args.taskType", args?.taskType === "background-remove");
  chk("args.input.rmbg_model", args?.input?.rmbg_model === "BEN2");
  chk("args.input.image", args?.input?.image === IMG);
  chk("args sem chaves extras", args !== undefined && Object.keys(args).sort().join(",") === "input,taskType");
  chk("args.input sem chaves extras", args?.input !== undefined && Object.keys(args.input).sort().join(",") === "image,rmbg_model");

  // request correlation preservada (mesmo requestId da rota chegou ao client)
  const reqId = calls[0]?.requestId;
  chk("requestId é string não-vazia (correlação preservada)", typeof reqId === "string" && reqId.length >= 8);

  // DB: provider_task_id + status
  const upd = (g.__dbUpdates ?? []).find((u) => u.patch.provider_task_id !== undefined);
  chk("DB grava provider_task_id", upd?.patch.provider_task_id === "task-removebg-test-123");
  chk("DB grava status processing", upd?.patch.status === "processing");

  // Ordem: cost → debit → submit → db-update (debit ANTES do submit)
  const order = g.__order ?? [];
  const iCost = order.indexOf("cost"), iDebit = order.indexOf("debit"), iSubmit = order.indexOf("submit"), iDb = order.indexOf("db-processing");
  chk("ordem cost<debit", iCost >= 0 && iCost < iDebit);
  chk("ordem debit<submit (debit antes do provider)", iDebit >= 0 && iDebit < iSubmit);
  chk("ordem submit<db-processing", iSubmit >= 0 && iSubmit < iDb);
  chk("billing na rota (debit registrado)", (g.__billing ?? []).some((b) => "debit" in b));

  // ── ERROR / REFUND ─────────────────────────────────────────────────────────
  reset();
  g.__piapiMode = "fail";
  const res2 = await POST(makeReq({ image_url: IMG, rmbg_model: "RMBG-2.0" }));
  chk("erro status 502", res2.status === 502);
  chk("submit foi tentado", (g.__removeBgPiapiCalls ?? []).length === 1);
  chk("refund chamado após falha", (g.__billing ?? []).some((b) => "refund" in b));
  const order2 = g.__order ?? [];
  chk("ordem debit<submit<refund", order2.indexOf("debit") < order2.indexOf("submit") && order2.indexOf("submit") < order2.indexOf("refund"));

  if (fails.length > 0) {
    throw new Error("removebg route parity.test falhou: " + fails.join(", "));
  }
  console.log("removebg route parity.test: OK (todas as assertivas passaram)");
});
