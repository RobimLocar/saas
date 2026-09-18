// P4e — Teste de paridade da rota Upscale (ROUTE → REGISTRY → PiAPI ADAPTER →
// PiAPI CLIENT). NÃO chama APIs reais. Runner-agnóstico (padrão P4b): as
// assertivas rodam no import; supabase/credits/next/@/lib/piapi/client são
// mockados por alias esbuild. Registry e adapter PiAPI são REAIS.
//
// O client mock grava em globalThis.__upscalePiapiCalls os args/requestId;
// os mocks de db/billing registram ordem em __order.

import { vi, test } from "vitest";

interface G {
  __upscalePiapiCalls?: Array<{ args: unknown; requestId: unknown }>;
  __dbUpdates?: Array<{ table: string; patch: Record<string, unknown> }>;
  __order?: string[];
  __billing?: Array<Record<string, unknown>>;
  __piapiMode?: string;
  __debitMode?: string;
}
const g = globalThis as unknown as G;

// Boundaries mockados: Supabase (user client + service-role client), credits
// (debit/refund/effectiveCost) e o client PiAPI de baixo nível. Registry e
// adapter PiAPI REAIS orquestram no meio — é a rota real que este teste prova.
function tableQuery(table: string) {
  const resolveSingle = async () => {
    if (table === "ai_models") return { data: { id: "model-upscale-1", credit_cost: 3 }, error: null };
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
          single: async () => ({ data: { id: "gen-upscale-1", ...row }, error: null }),
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
  debitCredits: async (_service: unknown, _userId: string, amount: number) => {
    (g.__order ??= []).push("debit");
    (g.__billing ??= []).push({ debit: [amount] });
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
    (g.__upscalePiapiCalls ??= []).push({ args, requestId });
    (g.__order ??= []).push("submit");
    if (g.__piapiMode === "fail") throw new Error("PiAPI toolkit failure (mock)");
    return { data: { task_id: "task-upscale-test-123", status: "pending" } };
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

const reset = (): void => { g.__upscalePiapiCalls = []; g.__dbUpdates = []; g.__order = []; g.__billing = []; g.__piapiMode = "ok"; g.__debitMode = "ok"; };

const fails: string[] = [];
const chk = (name: string, cond: boolean): void => { if (!cond) fails.push(name); };

function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}
const IMG = "https://img.test/upscale.png";

  // ── HAPPY PATH (scale=4 → multiplicador de custo ativo) ─────────────────────
  reset();
  const res = await POST(makeReq({ image_url: IMG, scale: 4, face_enhance: true }));
  const body = (await res.json()) as Record<string, unknown>;
  chk("happy status 200", res.status === 200);
  chk("happy generation_id", body.generation_id === "gen-upscale-1");
  chk("happy status processing", body.status === "processing");
  chk("sem campos externos novos", !("provider" in body) && !("canonicalId" in body) && !("requestId" in body) && !("providerTaskId" in body));

  const calls = g.__upscalePiapiCalls ?? [];
  chk("submitImageToolkitTask 1x", calls.length === 1);
  const args = calls[0]?.args as { taskType?: string; input?: Record<string, unknown> } | undefined;
  chk("args.taskType upscale", args?.taskType === "upscale");
  chk("args.input.image", args?.input?.image === IMG);
  chk("args.input.scale", args?.input?.scale === 4);
  chk("args.input.face_enhance", args?.input?.face_enhance === true);
  chk("args chaves exatas", args !== undefined && Object.keys(args).sort().join(",") === "input,taskType");
  chk("args.input chaves exatas", args?.input !== undefined && Object.keys(args.input).sort().join(",") === "face_enhance,image,scale");

  // request correlation: o requestId da rota (UUID) chegou ao client, não "upscale"/"-"
  const reqId = calls[0]?.requestId;
  chk("requestId UUID (correlação)", typeof reqId === "string" && reqId.length >= 8);
  chk("requestId != canonicalId 'upscale'", reqId !== "upscale");
  chk("requestId != '-'", reqId !== "-");

  // DB
  const upd = (g.__dbUpdates ?? []).find((u) => u.patch.provider_task_id !== undefined);
  chk("DB provider_task_id", upd?.patch.provider_task_id === "task-upscale-test-123");
  chk("DB status processing", upd?.patch.status === "processing");

  // Billing: scale 4 → effectiveCost(base=3) * 2 = 6 (lógica da rota preservada)
  const debitEntry = (g.__billing ?? []).find((b) => "debit" in b);
  const debitCost = debitEntry ? (debitEntry.debit as unknown[])[0] : undefined;
  chk("scale=4 → custo dobrado (6)", debitCost === 6);

  // Ordem happy: cost → debit → submit → db-processing
  const o = g.__order ?? [];
  chk("ordem cost<debit", o.indexOf("cost") >= 0 && o.indexOf("cost") < o.indexOf("debit"));
  chk("ordem debit<submit", o.indexOf("debit") < o.indexOf("submit"));
  chk("ordem submit<db-processing", o.indexOf("submit") < o.indexOf("db-processing"));

  // ── ERROR / REFUND ─────────────────────────────────────────────────────────
  reset();
  g.__piapiMode = "fail";
  const res2 = await POST(makeReq({ image_url: IMG, scale: 2, face_enhance: false }));
  chk("erro status 502", res2.status === 502);
  chk("submit tentado", (g.__upscalePiapiCalls ?? []).length === 1);
  chk("refund após falha", (g.__billing ?? []).some((b) => "refund" in b));
  const o2 = g.__order ?? [];
  chk("ordem debit<submit<refund", o2.indexOf("debit") < o2.indexOf("submit") && o2.indexOf("submit") < o2.indexOf("refund"));

  if (fails.length > 0) {
    throw new Error("upscale route parity.test falhou: " + fails.join(", "));
  }
  console.log("upscale route parity.test: OK (todas as assertivas passaram)");
});
