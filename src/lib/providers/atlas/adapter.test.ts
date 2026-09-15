// P3b — Teste isolado do adapter Atlas. NÃO chama Atlas Cloud real.
// Runner-agnóstico (mesmo padrão do teste PiAPI): assertivas rodam no import;
// `@/lib/atlas/client` é mockado na execução (vi.mock, resolvido pelo
// vitest.config.ts). O mock registra os args recebidos em
// globalThis.__atlasCalls e o modo em __atlasMode. Testa SOMENTE a delegação
// Provider→Atlas client (não testa o client em si). Nenhuma ATLAS_API_KEY
// real é necessária: generateSpeechAtlas é totalmente substituído; AtlasError
// é reexportado do módulo real para preservar `instanceof` entre adapter.ts
// e este teste.

import { vi } from "vitest";

vi.mock("@/lib/atlas/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atlas/client")>();
  const g = globalThis as unknown as { __atlasCalls?: unknown[]; __atlasMode?: string };
  return {
    ...actual,
    generateSpeechAtlas: async (call: Record<string, unknown>) => {
      if (!g.__atlasCalls) g.__atlasCalls = [];
      g.__atlasCalls.push(call);
      if (g.__atlasMode === "throw402") {
        throw new actual.AtlasError("Saldo Atlas insuficiente.", 402);
      }
      return "https://example.test/audio.mp3";
    },
  };
});

import { atlasProvider } from "./adapter";
import { AtlasError } from "@/lib/atlas/client";
import type { GenTask } from "../types";
import { test } from "vitest";

test("adapter.test.ts", async () => {

const g = globalThis as unknown as { __atlasCalls?: unknown[]; __atlasMode?: string };
const calls = (): unknown[] => g.__atlasCalls ?? [];
const setMode = (m: string): void => { g.__atlasMode = m; };
const fails: string[] = [];
const chk = (name: string, cond: boolean): void => { if (!cond) fails.push(name); };

function audioTask(call: Record<string, unknown>): GenTask {
  return { canonicalId: "t", type: "audio", input: {}, providerModelId: "atlas", params: { call } };
}
function typedTask(type: GenTask["type"], call: Record<string, unknown>): GenTask {
  return { canonicalId: "t", type, input: {}, providerModelId: "atlas", params: { call } };
}

  // 3. AUDIO SUBMIT COM SUCESSO + delegação exata
  setMode("ok");
  const fullCall = { text: "Hello world", voice: "voice-test", model: "elevenlabs/v3/text-to-speech", stability: 0.5 };
  const r = await atlasProvider.submit(audioTask({ ...fullCall }));
  chk("submit.providerTaskId", r.providerTaskId === "https://example.test/audio.mp3");
  chk("submit.status", r.status === "completed");
  chk("generateSpeechAtlas chamado 1x", calls().length === 1);
  const arg = calls()[0] as Record<string, unknown>;
  chk("delegou text sem transformar", arg?.text === "Hello world");
  chk("delegou voice sem transformar", arg?.voice === "voice-test");
  chk("delegou model sem transformar", arg?.model === "elevenlabs/v3/text-to-speech");
  chk("delegou stability sem transformar", arg?.stability === 0.5);

  // 4. CAMPOS OPCIONAIS (sem model/stability) — adapter só delega, não injeta default
  const r2 = await atlasProvider.submit(audioTask({ text: "Minimal text", voice: "voice-test" }));
  chk("opcional.status", r2.status === "completed");
  const arg2 = calls()[1] as Record<string, unknown>;
  chk("opcional sem model", arg2?.model === undefined);
  chk("opcional sem stability", arg2?.stability === undefined);

  // 5. TYPE NÃO SUPORTADO → AtlasError 400
  for (const t of ["video", "image"] as const) {
    let err: unknown;
    try { await atlasProvider.submit(typedTask(t, { text: "x", voice: "y" })); } catch (e) { err = e; }
    chk(`type ${t} rejeitado (AtlasError)`, err instanceof AtlasError);
    chk(`type ${t} status 400`, err instanceof AtlasError && err.status === 400);
  }

  // 6. CALL INVÁLIDA (voice ausente) → AtlasError 400
  {
    let err: unknown;
    try { await atlasProvider.submit(audioTask({ text: "só texto" })); } catch (e) { err = e; }
    chk("call inválida rejeitada", err instanceof AtlasError && err.status === 400);
  }

  // 7. PROPAGAÇÃO DE AtlasError (402 saldo insuficiente) — não engolir/normalizar
  {
    setMode("throw402");
    let err: unknown;
    try { await atlasProvider.submit(audioTask({ text: "a", voice: "b" })); } catch (e) { err = e; }
    chk("402 é AtlasError", err instanceof AtlasError);
    chk("402 status", err instanceof AtlasError && err.status === 402);
    setMode("ok");
  }

  // 8. getStatus HTTPS
  const s1 = await atlasProvider.getStatus("https://example.test/audio.mp3");
  chk("getStatus https", s1.status === "completed" && s1.resultUrl === "https://example.test/audio.mp3");

  // 9. getStatus HTTP (o adapter aceita http:// via regex ^https?://)
  const s2 = await atlasProvider.getStatus("http://example.test/audio.mp3");
  chk("getStatus http", s2.status === "completed" && s2.resultUrl === "http://example.test/audio.mp3");

  // 10. getStatus ID inválido → AtlasError
  {
    let err: unknown;
    try { await atlasProvider.getStatus("prediction-123"); } catch (e) { err = e; }
    chk("getStatus id inválido rejeitado", err instanceof AtlasError && err.status === 400);
  }

  if (fails.length > 0) {
    throw new Error("atlas adapter.test falhou: " + fails.join(", "));
  }
  console.log("atlas adapter.test: OK (todas as assertivas passaram)");
});
