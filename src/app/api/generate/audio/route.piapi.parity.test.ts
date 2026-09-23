// P4j — Parity test do BRANCH PIAPI da Audio route (ROUTE → REGISTER → REGISTRY
// → PIAPI ADAPTER → MOCK PIAPI CLIENT). NÃO chama APIs reais. Runner-agnóstico
// (mesmo padrão do route.atlas.parity.test.ts): a rota real é executada; o
// register/registry/PiAPI adapter são REAIS; apenas clients, supabase, credits,
// next/server, translate e o Atlas client são mockados por alias/global.
//
// Objetivo: congelar (parity-lock) o comportamento pós-P4i do branch PiAPI para
// Udio (music-u), ACE-Step (Qubico/ace-step) e aliases de catálogo que também
// caem em ACE-Step (elevenlabs-sfx, mmaudio). NÃO valida os gaps internos do
// client (lyrics_type, infer_step, lyrics "", duration) como contrato ideal —
// só prova ROUTE → ADAPTER → args do client + task_id + DB + response + billing.

import { vi, test } from "vitest";

interface AudioArgsTop {
  model?: string;
  prompt?: string;
  duration?: number;
  quality?: string;
  // Udio (music-u) — P5e. Só presentes quando o backend é music-u.
  lyricsType?: string;
  lyrics?: string;
  negativeTags?: string;
  seed?: number;
  // ACE-Step Music (Qubico/ace-step, kind music) — P5f.
  negativePrompt?: string;
  // MMAudio real (Qubico/mmaudio, video2audio) — P5h.
  video?: string;
}
interface G {
  __generateAudioCalls?: Array<{ args: AudioArgsTop }>;
  __atlasCalls?: number;
  __dbUpdates?: Array<{ table: string; patch: Record<string, unknown> }>;
  __inserts?: Array<{ table: string; payload: Record<string, unknown> }>;
  __order?: string[];
  __billing?: Array<Record<string, unknown>>;
  __currentModel?: Record<string, unknown> | null;
  __nextTaskId?: string;
  __failPiapi?: boolean;
}
const g = globalThis as unknown as G;

// Boundaries mockados: Supabase (user + service-role, incl. cooldown select),
// credits, translate (LLM externo → stub fixo), Atlas client (só para provar
// 0 chamadas) e o client PiAPI de baixo nível. Registry + adapter PiAPI REAIS
// (incl. resolveAudioUISpec real) discriminam os profiles de verdade — é
// exatamente isso que este teste prova. Zero rede real.
function makeQuery(table: string) {
  const resolveSingle = async () => {
    if (table === "ai_models") return { data: g.__currentModel ?? null, error: null };
    if (table === "profiles") return { data: { credits_balance: 1000, plan: "free" }, error: null };
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
          single: async () => ({ data: { id: "gen-piapi-1", ...row }, error: null }),
        }),
      };
    },
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        (g.__dbUpdates ??= []).push({ table, patch });
        if (patch.status === "processing") (g.__order ??= []).push("db-processing");
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

vi.mock("@/lib/translate", () => ({
  translateToEnglish: async () => "cinematic electronic instrumental",
}));

vi.mock("@/lib/credits", () => ({
  effectiveCost: (baseCost: number) => {
    (g.__order ??= []).push("cost");
    return baseCost;
  },
  debitCredits: async (_service: unknown, _userId: string, amount: number) => {
    (g.__order ??= []).push("debit");
    (g.__billing ??= []).push({ debit: [amount], amount });
    return { ok: true, balance: 1000 - amount };
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
    generateSpeechAtlas: async () => {
      g.__atlasCalls = (g.__atlasCalls ?? 0) + 1;
      return "https://atlas.test/unused.wav";
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
  generateAudio: async (args: unknown) => {
    (g.__generateAudioCalls ??= []).push({ args: args as AudioArgsTop });
    (g.__order ??= []).push("piapi-submit");
    if (g.__failPiapi) throw new Error("PiAPI generateAudio failure (mock)");
    return { data: { task_id: g.__nextTaskId ?? "task-x", status: "pending" } };
  },
  getTaskStatus: async () => ({ data: { status: "completed", output: {}, meta: {} } }),
  extractResultUrls: () => [],
  extractVideoUrl: () => undefined,
}));

import { POST } from "./route";

test("route.piapi.parity.test.ts", async () => {

const reset = (): void => {
  g.__generateAudioCalls = [];
  g.__atlasCalls = 0;
  g.__dbUpdates = [];
  g.__order = [];
  g.__billing = [];
  g.__currentModel = null;
  g.__nextTaskId = "task-x";
  g.__failPiapi = false;
};

const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };
function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

// Modelo de catálogo mínimo, no formato que a rota espera (ai_models row).
function model(model_id: string, credit_cost: number, params: Record<string, unknown>) {
  return { id: `uuid-${model_id}`, model_id, is_active: true, credit_cost, min_plan: "free", name: model_id, params };
}

async function runScenario(opts: {
  model: Record<string, unknown>;
  taskId: string;
  body: Record<string, unknown>;
  fail?: boolean;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  reset();
  g.__currentModel = opts.model;
  g.__nextTaskId = opts.taskId;
  g.__failPiapi = Boolean(opts.fail);
  const res = await POST(makeReq(opts.body));
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

// Assertivas comuns de um cenário PiAPI de sucesso.
function assertPiapiSuccess(
  tag: string,
  r: { status: number; body: Record<string, unknown> },
  expect: {
    model: string;
    taskId: string;
    cost: number;
    // Chaves EXATAS esperadas em args (ordenadas). Default = branch música/SFX
    // legado (4 chaves). Cenários Udio passam o conjunto com os campos de modo.
    argKeys?: string;
    // Campos Udio (music-u) esperados. undefined = não verificado.
    lyricsType?: "generate" | "instrumental" | "user";
    lyrics?: string;      // valor EXATO (não traduzido) esperado em args.lyrics
    negativeTags?: string;
    seed?: number;
    negativePrompt?: string; // ACE-Step Music (P5f)
    duration?: number;       // Kling Sound SFX (P5g); omitido = espera undefined
    video?: string;          // MMAudio (P5h)
  }
): void {
  const argsCall = (g.__generateAudioCalls ?? [])[0]?.args;
  chk(`${tag}: status 200`, r.status === 200);
  chk(`${tag}: response.status ausente (branch async não retorna status)`, !("status" in r.body));
  chk(`${tag}: generation_id`, r.body.generation_id === "gen-piapi-1");
  chk(`${tag}: task_id = providerTaskId`, r.body.task_id === expect.taskId);
  chk(`${tag}: credits_used`, r.body.credits_used === expect.cost);
  chk(`${tag}: balance = 1000 - cost`, r.body.balance === 1000 - expect.cost);
  chk(`${tag}: response sem campos Provider`, !("provider" in r.body) && !("canonicalId" in r.body) && !("requestId" in r.body) && !("providerModelId" in r.body) && !("submission" in r.body));

  // Args entregues ao client PiAPI (comportamento atual congelado).
  chk(`${tag}: generateAudio 1x`, (g.__generateAudioCalls ?? []).length === 1);
  chk(`${tag}: args.model`, argsCall?.model === expect.model);
  chk(`${tag}: args.prompt (traduzido)`, argsCall?.prompt === "cinematic electronic instrumental");
  chk(`${tag}: args.duration`, argsCall?.duration === expect.duration);
  chk(`${tag}: args.quality (atual = high)`, argsCall?.quality === "high");
  const expectedKeys = expect.argKeys ?? "duration,model,prompt,quality";
  chk(`${tag}: args chaves exatas`, argsCall !== undefined && Object.keys(argsCall).sort().join(",") === expectedKeys);
  // Campos Udio (P5e) — verificados só quando esperados.
  if (expect.lyricsType !== undefined) {
    chk(`${tag}: args.lyricsType`, argsCall?.lyricsType === expect.lyricsType);
  }
  if (expect.lyrics !== undefined) {
    chk(`${tag}: args.lyrics (texto do usuário, NÃO traduzido)`, argsCall?.lyrics === expect.lyrics);
  }
  if (expect.negativeTags !== undefined) {
    chk(`${tag}: args.negativeTags`, argsCall?.negativeTags === expect.negativeTags);
  }
  if (expect.seed !== undefined) {
    chk(`${tag}: args.seed`, argsCall?.seed === expect.seed);
  }
  if (expect.negativePrompt !== undefined) {
    chk(`${tag}: args.negativePrompt`, argsCall?.negativePrompt === expect.negativePrompt);
  }
  if (expect.video !== undefined) {
    chk(`${tag}: args.video`, argsCall?.video === expect.video);
  }

  // Atlas NÃO chamado nos cenários PiAPI.
  chk(`${tag}: generateSpeechAtlas 0x`, (g.__atlasCalls ?? -1) === 0);

  // DB: processing + provider_task_id (sem campos Provider Foundation).
  const proc = (g.__dbUpdates ?? []).find((u) => u.patch.status === "processing");
  chk(`${tag}: DB processing`, proc !== undefined);
  chk(`${tag}: DB provider_task_id`, proc?.patch.provider_task_id === expect.taskId);
  chk(`${tag}: DB sem result_url`, proc !== undefined && !("result_url" in proc.patch));
  chk(`${tag}: DB sem canonicalId/providerModelId`, proc !== undefined && !("canonicalId" in proc.patch) && !("provider_model_id" in proc.patch));

  // Ordem: cost → debit → piapi-submit → db-processing (débito ANTES do provider).
  const o = g.__order ?? [];
  chk(`${tag}: ordem cost<debit`, o.indexOf("cost") >= 0 && o.indexOf("cost") < o.indexOf("debit"));
  chk(`${tag}: ordem debit<piapi-submit`, o.indexOf("debit") < o.indexOf("piapi-submit"));
  chk(`${tag}: ordem piapi-submit<db-processing`, o.indexOf("piapi-submit") < o.indexOf("db-processing"));
}

  // ── CENÁRIO A — UDIO (music-u) sem music_mode → default INSTRUMENTAL ─────────
  // Back-compat: request legado sem music_mode mapeia para lyrics_type
  // "instrumental" (paridade com o comportamento anterior à P5e). Agora os args
  // carregam lyricsType (P5e), sem lyrics/negativeTags/seed.
  const udio = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u", family: "Música" }),
    taskId: "task-udio-123",
    body: { prompt: "algo em português", model_uuid: "uuid-udio-music" },
  });
  assertPiapiSuccess("UDIO-DEFAULT", udio, {
    model: "music-u", taskId: "task-udio-123", cost: 16,
    argKeys: "duration,lyricsType,model,prompt,quality",
    lyricsType: "instrumental",
  });

  // ── CENÁRIO A2 — UDIO AI Vocals (music_mode "ai-vocals" → "generate") ───────
  const udioAiVocals = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u", family: "Música" }),
    taskId: "task-udio-vocals",
    body: { prompt: "algo em português", model_uuid: "uuid-udio-music", music_mode: "ai-vocals" },
  });
  assertPiapiSuccess("UDIO-AI-VOCALS", udioAiVocals, {
    model: "music-u", taskId: "task-udio-vocals", cost: 16,
    argKeys: "duration,lyricsType,model,prompt,quality",
    lyricsType: "generate",
  });

  // ── CENÁRIO A3 — UDIO Custom Lyrics (music_mode "custom-lyrics" → "user") ────
  // A letra é do usuário e NÃO passa por translateToEnglish: args.lyrics deve ser
  // o texto ORIGINAL (não o constante mockado "cinematic electronic instrumental").
  const customLyricsText = "[Verse]\nletra em português do usuário\n[Chorus]";
  const udioCustom = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u", family: "Música" }),
    taskId: "task-udio-custom",
    body: {
      prompt: "algo em português",
      model_uuid: "uuid-udio-music",
      music_mode: "custom-lyrics",
      lyrics: customLyricsText,
    },
  });
  assertPiapiSuccess("UDIO-CUSTOM", udioCustom, {
    model: "music-u", taskId: "task-udio-custom", cost: 16,
    argKeys: "duration,lyrics,lyricsType,model,prompt,quality",
    lyricsType: "user",
    lyrics: customLyricsText,
  });

  // ── CENÁRIO A4 — UDIO Avançado (negative_tags + seed) ───────────────────────
  const udioAdvanced = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u", family: "Música" }),
    taskId: "task-udio-adv",
    body: {
      prompt: "algo em português",
      model_uuid: "uuid-udio-music",
      music_mode: "instrumental",
      negative_tags: "distorted, low quality",
      seed: 42,
    },
  });
  assertPiapiSuccess("UDIO-ADVANCED", udioAdvanced, {
    model: "music-u", taskId: "task-udio-adv", cost: 16,
    argKeys: "duration,lyricsType,model,negativeTags,prompt,quality,seed",
    lyricsType: "instrumental",
    negativeTags: "distorted, low quality",
    seed: 42,
  });

  // ── CENÁRIO B — ACE-STEP MUSIC legacy/default (sem music_mode → instrumental) ─
  // P5f: correção de contrato — instrumental agora envia lyrics OFICIAL "[inst]"
  // (antes "" mudo). backend ausente → model_id "Qubico/ace-step".
  const ace = await runScenario({
    model: model("Qubico/ace-step", 4, { kind: "music", family: "Música" }),
    taskId: "task-ace-123",
    body: { prompt: "algo em português", model_uuid: "uuid-Qubico/ace-step" },
  });
  assertPiapiSuccess("ACE-DEFAULT", ace, {
    model: "Qubico/ace-step", taskId: "task-ace-123", cost: 4,
    argKeys: "duration,lyrics,model,prompt,quality",
    lyrics: "[inst]",
  });

  // ── CENÁRIO B1 — ACE-STEP MUSIC instrumental explícito → "[inst]" ───────────
  const aceInst = await runScenario({
    model: model("Qubico/ace-step", 4, { kind: "music", family: "Música" }),
    taskId: "task-ace-inst",
    body: { prompt: "algo em português", model_uuid: "uuid-Qubico/ace-step", music_mode: "instrumental" },
  });
  assertPiapiSuccess("ACE-INSTRUMENTAL", aceInst, {
    model: "Qubico/ace-step", taskId: "task-ace-inst", cost: 4,
    argKeys: "duration,lyrics,model,prompt,quality",
    lyrics: "[inst]",
  });

  // ── CENÁRIO B2 — ACE-STEP MUSIC With Lyrics → letra do usuário (NÃO traduzida) ─
  const aceLyricsText = "[verse]\nletra em português do usuário\n[chorus]";
  const aceLyrics = await runScenario({
    model: model("Qubico/ace-step", 4, { kind: "music", family: "Música" }),
    taskId: "task-ace-lyrics",
    body: { prompt: "algo em português", model_uuid: "uuid-Qubico/ace-step", music_mode: "lyrics", lyrics: aceLyricsText },
  });
  assertPiapiSuccess("ACE-LYRICS", aceLyrics, {
    model: "Qubico/ace-step", taskId: "task-ace-lyrics", cost: 4,
    argKeys: "duration,lyrics,model,prompt,quality",
    lyrics: aceLyricsText,
  });

  // ── CENÁRIO B3 — ACE-STEP MUSIC + negative_prompt propagado ─────────────────
  const aceNeg = await runScenario({
    model: model("Qubico/ace-step", 4, { kind: "music", family: "Música" }),
    taskId: "task-ace-neg",
    body: { prompt: "algo em português", model_uuid: "uuid-Qubico/ace-step", music_mode: "instrumental", negative_prompt: "noise" },
  });
  assertPiapiSuccess("ACE-NEGATIVE", aceNeg, {
    model: "Qubico/ace-step", taskId: "task-ace-neg", cost: 4,
    argKeys: "duration,lyrics,model,negativePrompt,prompt,quality",
    lyrics: "[inst]",
    negativePrompt: "noise",
  });

  // ── CENÁRIO B4 — ACE-STEP MUSIC modo inválido → 400 (antes de débito/provider) ─
  const aceInvalid = await runScenario({
    model: model("Qubico/ace-step", 4, { kind: "music", family: "Música" }),
    taskId: "task-ace-invalid",
    body: { prompt: "test", model_uuid: "uuid-Qubico/ace-step", music_mode: "ai-vocals" },
  });
  chk("ACE-INVALID: status 400", aceInvalid.status === 400);
  chk("ACE-INVALID: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("ACE-INVALID: sem debit", !(g.__order ?? []).includes("debit"));
  chk("ACE-INVALID: sem provider submit", !(g.__order ?? []).includes("piapi-submit"));

  // ── CENÁRIO B5 — ACE-STEP MUSIC lyrics mode com letra vazia → 400 ───────────
  const aceEmpty = await runScenario({
    model: model("Qubico/ace-step", 4, { kind: "music", family: "Música" }),
    taskId: "task-ace-empty",
    body: { prompt: "test", model_uuid: "uuid-Qubico/ace-step", music_mode: "lyrics", lyrics: "   " },
  });
  chk("ACE-EMPTY-LYRICS: status 400", aceEmpty.status === 400);
  chk("ACE-EMPTY-LYRICS: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("ACE-EMPTY-LYRICS: sem debit", !(g.__order ?? []).includes("debit"));

  // ── CENÁRIO C1 — ALIAS elevenlabs-sfx (provider "atlas" no catálogo, mas
  // backend Qubico/ace-step + kind sfx → DEVE cair no branch PiAPI ACE-Step) ───
  const sfx = await runScenario({
    model: model("elevenlabs-sfx", 4, { kind: "sfx", backend: "Qubico/ace-step", provider: "atlas", family: "ElevenLabs" }),
    taskId: "task-sfx-123",
    body: { prompt: "algo em português", model_uuid: "uuid-elevenlabs-sfx" },
  });
  assertPiapiSuccess("ALIAS-SFX", sfx, { model: "Qubico/ace-step", taskId: "task-sfx-123", cost: 4 });

  // ── CENÁRIO C2 — ALIAS mmaudio (CATALOG MISMATCH: MMAudio oficial é
  // Qubico/mmaudio/video2audio; aqui roteia para Qubico/ace-step) ─────────────
  const mm = await runScenario({
    model: model("mmaudio", 8, { kind: "sfx", backend: "Qubico/ace-step", family: "MMAudio" }),
    taskId: "task-mmaudio-123",
    body: { prompt: "algo em português", model_uuid: "uuid-mmaudio" },
  });
  assertPiapiSuccess("ALIAS-MMAUDIO", mm, { model: "Qubico/ace-step", taskId: "task-mmaudio-123", cost: 8 });

  // ── CENÁRIO D — FALHA PiAPI → refund ────────────────────────────────────────
  const err = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u" }),
    taskId: "task-udio-fail",
    body: { prompt: "algo em português", model_uuid: "uuid-udio-music" },
    fail: true,
  });
  chk("ERR: status 502 (erro genérico PiAPI, não AtlasError)", err.status === 502);
  chk("ERR: message preservada", typeof err.body.error === "string" && (err.body.error as string).length > 0);
  chk("ERR: generateAudio tentado 1x", (g.__generateAudioCalls ?? []).length === 1);
  chk("ERR: generateSpeechAtlas 0x", (g.__atlasCalls ?? -1) === 0);
  chk("ERR: refund após falha", (g.__billing ?? []).some((b) => "refund" in b));
  const oe = g.__order ?? [];
  chk("ERR: ordem debit<piapi-submit<refund", oe.indexOf("debit") < oe.indexOf("piapi-submit") && oe.indexOf("piapi-submit") < oe.indexOf("refund"));
  chk("ERR: DB failed", (g.__dbUpdates ?? []).some((u) => u.patch.status === "failed"));

  // ── CENÁRIO E — UDIO music_mode EXPLÍCITO INVÁLIDO → 400 (P5e-fix) ──────────
  // Modo desconhecido NÃO vira instrumental silenciosamente: 400 ANTES de
  // débito/provider/insert. Nada é cobrado nem submetido.
  const invalidMode = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u" }),
    taskId: "task-udio-invalid",
    body: { prompt: "test", model_uuid: "uuid-udio-music", music_mode: "invalid-mode" },
  });
  chk("INVALID-MODE: status 400", invalidMode.status === 400);
  chk("INVALID-MODE: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("INVALID-MODE: atlas 0x", (g.__atlasCalls ?? -1) === 0);
  chk("INVALID-MODE: sem debit", !(g.__order ?? []).includes("debit"));
  chk("INVALID-MODE: sem billing", (g.__billing ?? []).length === 0);
  chk("INVALID-MODE: sem provider submit", !(g.__order ?? []).includes("piapi-submit"));

  // ── CENÁRIO F — UDIO custom-lyrics SEM letra → 400 (P5e-fix) ────────────────
  const emptyLyrics = await runScenario({
    model: model("udio-music", 16, { kind: "music", backend: "music-u" }),
    taskId: "task-udio-empty",
    body: { prompt: "test", model_uuid: "uuid-udio-music", music_mode: "custom-lyrics", lyrics: "   " },
  });
  chk("EMPTY-LYRICS: status 400", emptyLyrics.status === 400);
  chk("EMPTY-LYRICS: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("EMPTY-LYRICS: sem debit", !(g.__order ?? []).includes("debit"));
  chk("EMPTY-LYRICS: sem provider submit", !(g.__order ?? []).includes("piapi-submit"));

  // ── CENÁRIO G — SFX (ace-step-sfx) IGNORA music_mode/lyrics (FASE 5/38) ──────
  // Profile sem modos → validação de modo não se aplica; music_mode/lyrics não
  // vazam para os args (permanece 4-key). Prova a separação ACE Music × SFX.
  const sfxIgnores = await runScenario({
    model: model("elevenlabs-sfx", 4, { kind: "sfx", backend: "Qubico/ace-step", provider: "atlas" }),
    taskId: "task-sfx-ignore",
    body: {
      prompt: "algo em português",
      model_uuid: "uuid-elevenlabs-sfx",
      music_mode: "ai-vocals",
      lyrics: "não deve vazar",
      negative_prompt: "não deve vazar",
    },
  });
  assertPiapiSuccess("SFX-IGNORE-MODE", sfxIgnores, { model: "Qubico/ace-step", taskId: "task-sfx-ignore", cost: 4 });

  // ── CENÁRIO H — KLING SOUND SFX duration 5 (SKU truthful fixture) ───────────
  // provider=piapi, backend=kling, kind=sfx → profile kling-sfx. args model kling,
  // prompt traduzido, duration 5, sem campos Udio/ACE (4-key). SKU NÃO existe no
  // DB (fixture apenas) — nenhuma decisão de preço aqui.
  const klingModel = (dur?: unknown, provider = "piapi", backend = "kling") => ({
    ...model("kling-sound", 4, { kind: "sfx", backend }),
    provider,
    __body: { prompt: "algo em português", model_uuid: "uuid-kling-sound", ...(dur === undefined ? {} : { duration: dur }) },
  });
  const kling5 = await runScenario({
    model: klingModel(5),
    taskId: "task-kling-5",
    body: klingModel(5).__body,
  });
  assertPiapiSuccess("KLING-5", kling5, {
    model: "kling", taskId: "task-kling-5", cost: 4,
    argKeys: "duration,model,prompt,quality",
    duration: 5,
  });

  // ── CENÁRIO H2 — KLING duration 10 ──────────────────────────────────────────
  const kling10 = await runScenario({
    model: klingModel(10),
    taskId: "task-kling-10",
    body: klingModel(10).__body,
  });
  assertPiapiSuccess("KLING-10", kling10, {
    model: "kling", taskId: "task-kling-10", cost: 4,
    argKeys: "duration,model,prompt,quality",
    duration: 10,
  });

  // ── CENÁRIO H3 — KLING missing duration → 400 (antes de insert/debit/provider) ─
  const klingMissing = await runScenario({
    model: klingModel(undefined),
    taskId: "task-kling-miss",
    body: klingModel(undefined).__body,
  });
  chk("KLING-MISSING: status 400", klingMissing.status === 400);
  chk("KLING-MISSING: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("KLING-MISSING: sem debit", !(g.__order ?? []).includes("debit"));
  chk("KLING-MISSING: sem provider submit", !(g.__order ?? []).includes("piapi-submit"));

  // ── CENÁRIO H4 — KLING invalid duration (6 / 11 / "5") → 400 ────────────────
  for (const bad of [6, 11, "5"] as unknown[]) {
    const r = await runScenario({
      model: klingModel(bad),
      taskId: "task-kling-bad",
      body: klingModel(bad).__body,
    });
    chk(`KLING-INVALID(${JSON.stringify(bad)}): status 400`, r.status === 400);
    chk(`KLING-INVALID(${JSON.stringify(bad)}): generateAudio 0x`, (g.__generateAudioCalls ?? []).length === 0);
    chk(`KLING-INVALID(${JSON.stringify(bad)}): sem debit`, !(g.__order ?? []).includes("debit"));
  }

  // ── CENÁRIO H5 — KLING contract mismatch (provider=atlas) → 400 ─────────────
  const klingMismatch = await runScenario({
    model: klingModel(5, "atlas"),
    taskId: "task-kling-mm",
    body: klingModel(5, "atlas").__body,
  });
  chk("KLING-MISMATCH: status 400", klingMismatch.status === 400);
  chk("KLING-MISMATCH: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("KLING-MISMATCH: sem debit", !(g.__order ?? []).includes("debit"));

  // ── CENÁRIO I — MMAUDIO real (Qubico/mmaudio, video2audio) happy ────────────
  // provider=piapi, backend=Qubico/mmaudio → profile mmaudio-video2audio. args model
  // Qubico/mmaudio, video (URL), prompt traduzido. SKU NÃO existe no DB (fixture).
  const mmModel = (opts: { videoUrl?: unknown; provider?: string; backend?: string; neg?: string; prompt?: string }) => {
    const m = { ...model("mmaudio-video2audio", 4, { kind: "sfx", backend: opts.backend ?? "Qubico/mmaudio" }), provider: opts.provider ?? "piapi" };
    const body: Record<string, unknown> = { prompt: opts.prompt ?? "algo em português", model_uuid: "uuid-mmaudio-video2audio" };
    if (opts.videoUrl !== undefined) body.video_url = opts.videoUrl;
    if (opts.neg !== undefined) body.negative_prompt = opts.neg;
    return { model: m, body };
  };

  const mmFix = mmModel({ videoUrl: "https://pub/v.mp4" });
  const mmHappy = await runScenario({ model: mmFix.model, taskId: "task-mm-1", body: mmFix.body });
  assertPiapiSuccess("MMAUDIO", mmHappy, {
    model: "Qubico/mmaudio", taskId: "task-mm-1", cost: 4,
    argKeys: "duration,model,prompt,quality,video",
    video: "https://pub/v.mp4",
  });

  // ── CENÁRIO I2 — MMAUDIO + negative_prompt propagado ────────────────────────
  const mmNeg = mmModel({ videoUrl: "https://pub/v.mp4", neg: "music, speech" });
  const mmNegRes = await runScenario({ model: mmNeg.model, taskId: "task-mm-neg", body: mmNeg.body });
  assertPiapiSuccess("MMAUDIO-NEG", mmNegRes, {
    model: "Qubico/mmaudio", taskId: "task-mm-neg", cost: 4,
    argKeys: "duration,model,negativePrompt,prompt,quality,video",
    video: "https://pub/v.mp4",
    negativePrompt: "music, speech",
  });

  // ── CENÁRIO I3 — MMAUDIO sem video → 400 (antes de insert/debit/provider) ───
  const mmNoVid = mmModel({});
  const mmNoVidRes = await runScenario({ model: mmNoVid.model, taskId: "task-mm-nv", body: mmNoVid.body });
  chk("MMAUDIO-NO-VIDEO: status 400", mmNoVidRes.status === 400);
  chk("MMAUDIO-NO-VIDEO: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("MMAUDIO-NO-VIDEO: sem debit", !(g.__order ?? []).includes("debit"));
  chk("MMAUDIO-NO-VIDEO: sem provider submit", !(g.__order ?? []).includes("piapi-submit"));

  // ── CENÁRIO I4 — MMAUDIO video URL inválida → 400 ───────────────────────────
  const mmBadUrl = mmModel({ videoUrl: "not-a-url" });
  const mmBadRes = await runScenario({ model: mmBadUrl.model, taskId: "task-mm-bad", body: mmBadUrl.body });
  chk("MMAUDIO-INVALID-URL: status 400", mmBadRes.status === 400);
  chk("MMAUDIO-INVALID-URL: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("MMAUDIO-INVALID-URL: sem debit", !(g.__order ?? []).includes("debit"));

  // ── CENÁRIO I5 — MMAUDIO contract mismatch (provider=atlas) → 400 ───────────
  const mmMm = mmModel({ videoUrl: "https://pub/v.mp4", provider: "atlas" });
  const mmMmRes = await runScenario({ model: mmMm.model, taskId: "task-mm-mm", body: mmMm.body });
  chk("MMAUDIO-MISMATCH: status 400", mmMmRes.status === 400);
  chk("MMAUDIO-MISMATCH: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);
  chk("MMAUDIO-MISMATCH: sem debit", !(g.__order ?? []).includes("debit"));

  // ── CENÁRIO I6 — MMAUDIO prompt whitespace → 400 (PRODUCT UX) ───────────────
  const mmWs = mmModel({ videoUrl: "https://pub/v.mp4", prompt: "   " });
  const mmWsRes = await runScenario({ model: mmWs.model, taskId: "task-mm-ws", body: mmWs.body });
  chk("MMAUDIO-EMPTY-PROMPT: status 400", mmWsRes.status === 400);
  chk("MMAUDIO-EMPTY-PROMPT: generateAudio 0x", (g.__generateAudioCalls ?? []).length === 0);

  // ── CENÁRIO I7 — LEAK: video_url enviado a um modelo NÃO-MMAudio é ignorado ──
  // Kling recebe video_url no body mas os args NÃO devem conter video (gating por profile).
  const klingLeak = await runScenario({
    model: klingModel(5),
    taskId: "task-kling-leak",
    body: { prompt: "algo em português", model_uuid: "uuid-kling-sound", duration: 5, video_url: "https://pub/v.mp4", negative_prompt: "x" },
  });
  assertPiapiSuccess("KLING-NO-VIDEO-LEAK", klingLeak, {
    model: "kling", taskId: "task-kling-leak", cost: 4,
    argKeys: "duration,model,prompt,quality",
    duration: 5,
  });

  if (fails.length > 0) {
    throw new Error("audio piapi parity.test falhou: " + fails.join(", "));
  }
  console.log("audio piapi parity.test: OK (todas as assertivas passaram)");
});
