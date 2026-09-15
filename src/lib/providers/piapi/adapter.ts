// P2a — Adapter PiAPI atrás da interface Provider (SOMENTE delegação).
// NÃO cria lógica de payload nova, NÃO muda nomes, NÃO move client.ts.
// Delega às funções existentes de src/lib/piapi/client.ts. Nenhuma rota usa
// isto ainda (a migração das rotas é P4), portanto zero mudança de comportamento.
//
// A "call" (qual função + args) é fornecida pelo caller em task.params.call —
// assim o adapter permanece pura delegação, sem rederivar o dispatch que hoje
// vive nas rotas (ex.: image/route.ts). A tradução CanonicalInput→args será P4.

import { registerProvider } from "../registry";
import type { Provider, GenTask, SubmitResult, StatusResult } from "../types";
import {
  buildVideoPayload,
  submitVideoTask,
  generateImage,
  submitQwenImageTask,
  submitGeminiImageTask,
  submitImageToolkitTask,
  generateImageGptSync,
  generateImageGptEdits,
  generateAudio,
  getTaskStatus,
  extractResultUrls,
  extractVideoUrl,
  type BuildVideoArgs,
  type ImageGenParams,
  type GeminiImageArgs,
  type GptImageParams,
  type AudioGenParams,
  type PiAPITaskResponse,
} from "@/lib/piapi/client";

/** Descreve exatamente qual função de client.ts invocar + seus args. */
export type PiapiCall =
  | { op: "video"; buildArgs: BuildVideoArgs }
  | { op: "generateImage"; args: ImageGenParams }
  | { op: "qwen"; args: Parameters<typeof submitQwenImageTask>[0] }
  | { op: "gemini"; args: GeminiImageArgs }
  | { op: "toolkit"; args: Parameters<typeof submitImageToolkitTask>[0] }
  | { op: "gptSync"; args: GptImageParams }
  | { op: "gptEdits"; args: Parameters<typeof generateImageGptEdits>[0] }
  | { op: "audio"; args: AudioGenParams };

function fromTaskResponse(res: PiAPITaskResponse): SubmitResult {
  return { providerTaskId: res.data.task_id, status: res.data.status };
}

async function submit(task: GenTask): Promise<SubmitResult> {
  const call = (task.params as { call?: PiapiCall }).call;
  if (!call) {
    throw new Error("piapi.adapter: task.params.call ausente (delegação P2a).");
  }
  // Correlação de execução: usa requestId próprio. NUNCA cai em canonicalId
  // (isso reacoplaria identidade estável × correlação efêmera). Default "-" (= client).
  const requestId = task.requestId || "-";
  switch (call.op) {
    // ── VÍDEO ────────────────────────────────────────────────────────────────
    case "video": {
      const payload = buildVideoPayload(call.buildArgs);
      return fromTaskResponse(await submitVideoTask(payload, requestId));
    }
    // ── IMAGEM (assíncronas via /task) ───────────────────────────────────────
    case "generateImage":
      return fromTaskResponse(await generateImage(call.args));
    case "qwen":
      return fromTaskResponse(await submitQwenImageTask(call.args));
    case "gemini":
      return fromTaskResponse(await submitGeminiImageTask(call.args));
    case "toolkit":
      return fromTaskResponse(await submitImageToolkitTask(call.args, requestId));
    // ── IMAGEM (GPT — síncronas: retornam URL direta) ────────────────────────
    case "gptSync": {
      const url = await generateImageGptSync(call.args);
      return { providerTaskId: url, status: "completed" };
    }
    case "gptEdits": {
      const url = await generateImageGptEdits(call.args);
      return { providerTaskId: url, status: "completed" };
    }
    // ── ÁUDIO ────────────────────────────────────────────────────────────────
    case "audio":
      return fromTaskResponse(await generateAudio(call.args));
  }
}

async function getStatus(providerTaskId: string): Promise<StatusResult> {
  // Resultados síncronos (GPT) chegam como URL direta em providerTaskId.
  if (/^https?:\/\//i.test(providerTaskId)) {
    return { status: "completed", resultUrl: providerTaskId };
  }
  const st = await getTaskStatus(providerTaskId);
  const output = st.data.output;
  // P5g — propaga multi-output: extractResultUrls devolve N URLs (Kling works[])
  // ou 1 (demais). resultUrl = primary = urls[0] (invariant). Vídeo mantém o
  // fallback do extractor de vídeo. resultUrls só quando há verdadeiro multi.
  const urls = extractResultUrls(output);
  const resultUrl = urls[0] ?? extractVideoUrl(output) ?? undefined;
  const meta = st.data.meta as { usage?: { consume?: number } } | undefined;
  return {
    status: st.data.status,
    resultUrl,
    ...(urls.length > 1 ? { resultUrls: urls } : {}),
    usage: meta?.usage?.consume != null ? { consume: meta.usage.consume } : undefined,
    error: st.data.error?.message,
  };
}

export const piapiProvider: Provider = {
  id: "piapi",
  submit,
  getStatus,
};

// Registro no registry. Como nenhuma rota importa este módulo, o registro só
// ocorre se algo o importar — sem efeito no comportamento atual.
registerProvider(piapiProvider);
