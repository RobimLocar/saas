// Teste isolado do adapter PiAPI (P2b). NÃO chama APIs reais.
// Runner-agnóstico: as assertivas rodam no import. `@/lib/piapi/client` é
// mockado na execução (vi.mock, resolvido pelo vitest.config.ts), então
// nenhuma rede/env é tocada. O mock registra as funções chamadas em
// globalThis.__piapiCalls.

import { vi } from "vitest";

vi.mock("@/lib/piapi/client", () => {
  const g = globalThis as unknown as {
    __piapiCalls?: string[];
    __piapiReqIds?: { video?: string; toolkit?: string };
    __extractUrls?: string[];
  };
  const record = (name: string): void => {
    if (!g.__piapiCalls) g.__piapiCalls = [];
    g.__piapiCalls.push(name);
  };
  return {
    buildVideoPayload: (args: unknown) => {
      record("buildVideoPayload");
      return args;
    },
    submitVideoTask: async (_payload: unknown, requestId?: string) => {
      record("submitVideoTask");
      g.__piapiReqIds = { ...(g.__piapiReqIds ?? {}), video: requestId };
      return { data: { task_id: "vid1", status: "pending" } };
    },
    generateImage: async () => {
      record("generateImage");
      return { data: { task_id: "img_gen", status: "pending" } };
    },
    submitQwenImageTask: async () => {
      record("submitQwenImageTask");
      return { data: { task_id: "img_qwen", status: "pending" } };
    },
    submitGeminiImageTask: async () => {
      record("submitGeminiImageTask");
      return { data: { task_id: "img_gem", status: "pending" } };
    },
    submitImageToolkitTask: async (_args: unknown, requestId?: string) => {
      record("submitImageToolkitTask");
      g.__piapiReqIds = { ...(g.__piapiReqIds ?? {}), toolkit: requestId };
      return { data: { task_id: "img_tk", status: "pending" } };
    },
    generateImageGptSync: async () => {
      record("generateImageGptSync");
      return "https://cdn/gptsync.png";
    },
    generateImageGptEdits: async () => {
      record("generateImageGptEdits");
      return "https://cdn/gptedits.png";
    },
    generateAudio: async () => {
      record("generateAudio");
      return { data: { task_id: "aud1", status: "pending" } };
    },
    getTaskStatus: async (_id: string) => {
      record("getTaskStatus");
      return { data: { status: "completed", output: {}, meta: { usage: { consume: 42 } } } };
    },
    extractResultUrls: (_output: unknown) => g.__extractUrls ?? [],
    extractVideoUrl: (_output: unknown) => undefined,
  };
});

import { piapiProvider } from "./adapter";
import type { GenTask } from "../types";
import { test } from "vitest";

test("adapter.test.ts", async () => {

const g = globalThis as unknown as {
  __piapiCalls?: string[];
  __piapiReqIds?: { video?: string; toolkit?: string };
  __extractUrls?: string[];
};
const called = (): string[] => g.__piapiCalls ?? [];
const reqIds = (): { video?: string; toolkit?: string } => g.__piapiReqIds ?? {};
const fails: string[] = [];
const chk = (name: string, cond: boolean): void => {
  if (!cond) fails.push(name);
};

function task(type: GenTask["type"], call: Record<string, unknown>): GenTask {
  return { canonicalId: "t", type, input: {}, providerModelId: "m", params: { call } };
}
function taskReq(type: GenTask["type"], call: Record<string, unknown>, canonicalId: string, requestId?: string): GenTask {
  return { canonicalId, requestId, type, input: {}, providerModelId: "m", params: { call } };
}

  // 1. VIDEO → buildVideoPayload + submitVideoTask
  const v = await piapiProvider.submit(task("video", { op: "video", buildArgs: {} }));
  chk("video.providerTaskId", v.providerTaskId === "vid1");
  chk("video.status", v.status === "pending");
  chk("video chamou buildVideoPayload", called().includes("buildVideoPayload"));
  chk("video chamou submitVideoTask", called().includes("submitVideoTask"));

  // 2. IMAGE ASYNC
  chk("qwen", (await piapiProvider.submit(task("image", { op: "qwen", args: {} }))).providerTaskId === "img_qwen");
  chk("gemini", (await piapiProvider.submit(task("image", { op: "gemini", args: {} }))).providerTaskId === "img_gem");
  chk("toolkit", (await piapiProvider.submit(task("image", { op: "toolkit", args: {} }))).providerTaskId === "img_tk");

  // 3. IMAGE SYNC (GPT) → {status:"completed", resultUrl}
  const gs = await piapiProvider.submit(task("image", { op: "gptSync", args: {} }));
  chk("gptSync.status", gs.status === "completed");
  chk("gptSync.url", gs.providerTaskId === "https://cdn/gptsync.png");
  const gsSt = await piapiProvider.getStatus(gs.providerTaskId);
  chk("gptSync getStatus resultUrl", gsSt.status === "completed" && gsSt.resultUrl === "https://cdn/gptsync.png");
  const ge = await piapiProvider.submit(task("image", { op: "gptEdits", args: {} }));
  chk("gptEdits completed+url", ge.status === "completed" && ge.providerTaskId === "https://cdn/gptedits.png");

  // 4. AUDIO
  chk("audio", (await piapiProvider.submit(task("audio", { op: "audio", args: {} }))).providerTaskId === "aud1");

  // 5. STATUS → StatusResult normalizado (single-output: sem regressão)
  g.__extractUrls = ["https://cdn/v.mp4"];
  const st = await piapiProvider.getStatus("vid1");
  chk("status.status", st.status === "completed");
  chk("status.resultUrl", st.resultUrl === "https://cdn/v.mp4");
  chk("status.usage.consume", st.usage?.consume === 42);
  chk("status single: sem resultUrls", st.resultUrls === undefined);

  // 5b. P5g — STATUS multi-output: client resultUrls → adapter GenStatus.resultUrls
  // e resultUrl = resultUrls[0] (invariant).
  g.__extractUrls = ["https://cdn/a.mp3", "https://cdn/b.mp3", "https://cdn/c.mp3", "https://cdn/d.mp3"];
  const stMulti = await piapiProvider.getStatus("task-multi");
  chk("status multi: resultUrls 4", Array.isArray(stMulti.resultUrls) && stMulti.resultUrls!.length === 4);
  chk("status multi: resultUrl = resultUrls[0]", stMulti.resultUrl === "https://cdn/a.mp3" && stMulti.resultUrl === stMulti.resultUrls![0]);

  // 6. P4c — SEPARAÇÃO canonicalId × requestId.
  // 6a. toolkit: requestId próprio chega ao client, NÃO o canonicalId.
  await piapiProvider.submit(taskReq("image", { op: "toolkit", args: {} }, "remove-bg", "req-toolkit-123"));
  chk("toolkit usa task.requestId", reqIds().toolkit === "req-toolkit-123");
  chk("toolkit NÃO usa canonicalId", reqIds().toolkit !== "remove-bg");
  // 6b. video: requestId próprio chega ao submitVideoTask, NÃO o canonicalId.
  await piapiProvider.submit(taskReq("video", { op: "video", buildArgs: {} }, "kling-3.0", "req-video-123"));
  chk("video usa task.requestId", reqIds().video === "req-video-123");
  chk("video NÃO usa canonicalId", reqIds().video !== "kling-3.0");
  // 6c. fallback: sem requestId → "-", nunca o canonicalId.
  await piapiProvider.submit(taskReq("image", { op: "toolkit", args: {} }, "remove-bg", undefined));
  chk("fallback toolkit = '-'", reqIds().toolkit === "-");
  chk("fallback NÃO usa canonicalId", reqIds().toolkit !== "remove-bg");

  if (fails.length > 0) {
    throw new Error("adapter.test falhou: " + fails.join(", "));
  }
  console.log("adapter.test: OK (todas as assertivas passaram)");
});
