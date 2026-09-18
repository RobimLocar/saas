// P3a — Adapter Atlas atrás da interface Provider (SOMENTE delegação).
// NÃO altera atlas/client.ts, NÃO altera a audio route, NÃO cria payload/poll/
// lógica de voz nova. Delega a generateSpeechAtlas. Nenhuma rota usa isto ainda
// (migração das rotas é P4), portanto zero mudança de comportamento.
//
// Estrutural: o Atlas não separa submit/poll — generateSpeechAtlas já retorna a
// URL final. Por isso submit() devolve {providerTaskId:url, status:"completed"}
// e getStatus(url) devolve {status:"completed", resultUrl:url} — mesmo padrão do
// adapter PiAPI para resultados síncronos (GPT).

import { registerProvider } from "../registry";
import type { Provider, GenTask, SubmitResult, StatusResult } from "../types";
import { generateSpeechAtlas, AtlasError } from "@/lib/atlas/client";

/** Args esperados em task.params.call (formato de AtlasSpeechParams). */
export interface AtlasCall {
  text: string;
  voice: string;
  model?: string;
  stability?: number;
}

async function submit(task: GenTask): Promise<SubmitResult> {
  if (task.type !== "audio") {
    throw new AtlasError(`Atlas suporta apenas type "audio" (recebido: "${task.type}").`, 400);
  }
  const call = (task.params as { call?: AtlasCall }).call;
  if (!call || typeof call.text !== "string" || typeof call.voice !== "string") {
    throw new AtlasError("atlas.adapter: task.params.call inválido (delegação P3a).", 400);
  }
  const url = await generateSpeechAtlas(call);
  return { providerTaskId: url, status: "completed" };
}

async function getStatus(providerTaskId: string): Promise<StatusResult> {
  // O resultado do Atlas é a URL final (síncrono); não há task id consultável.
  if (/^https?:\/\//i.test(providerTaskId)) {
    return { status: "completed", resultUrl: providerTaskId };
  }
  throw new AtlasError(
    "atlas.adapter.getStatus: id não é uma URL de resultado (Atlas não expõe polling separado).",
    400
  );
}

export const atlasProvider: Provider = {
  id: "atlas",
  submit,
  getStatus,
};

// Registro no registry. Como nenhuma rota importa este módulo, o registro só
// ocorre se algo o importar — sem efeito no comportamento atual.
registerProvider(atlasProvider);
