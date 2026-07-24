// Corrige os modelos de voz (ElevenLabs) do catálogo, que estavam apontando
// para o backend "Qubico/ace-step" (música) e por isso davam "Falha na geração".
//
// Realidade técnica (validada em 2026-07): a PiAPI não integra ElevenLabs e o
// RouteLLM da Abacus rejeita o modelo "elevenlabs". O único motor de TTS
// acessível sem chave nova é o gpt-4o-audio da Abacus. Mapeamos os modelos de
// voz para o backend "abacus-tts" (kind tts) e mantemos os nomes do design.
// Idempotente — pode rodar várias vezes.
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

// merge de params por nome de modelo
const MAP = {
  "ElevenLabs Flash": {
    backend: "abacus-tts",
    kind: "tts",
    badge: "FAST",
    gen_time: "1S",
    tts_model: "gpt-4o-mini-audio-preview",
    family_description: "Fastest voice generation for real-time use",
  },
  "ElevenLabs Turbo V2.5": {
    backend: "abacus-tts",
    kind: "tts",
    badge: "RECOMMENDED",
    gen_time: "2S",
    tts_model: "gpt-4o-mini-audio-preview",
    family_description: "Low-latency streaming voice generation",
  },
  "ElevenLabs Multilingual V2": {
    backend: "abacus-tts",
    kind: "tts",
    badge: null,
    gen_time: "5S",
    tts_model: "gpt-4o-audio-preview",
    family_description: "Ultra-realistic multilingual text-to-speech",
  },
  // SFX não é TTS — segue no backend de áudio da PiAPI (funciona), só ajusta
  // os metadados de exibição.
  "ElevenLabs Sound Effects": {
    backend: "Qubico/ace-step",
    kind: "sfx",
    badge: "NEW",
    gen_time: "5S",
    family_description: "AI-generated sound effects from text prompts",
  },
};

const res = await fetch(`${URL_}/rest/v1/ai_models?select=id,name,params`, {
  headers: H,
});
const rows = await res.json();

for (const row of rows) {
  const patch = MAP[row.name];
  if (!patch) continue;
  const params = { ...(row.params || {}), ...patch };
  const up = await fetch(`${URL_}/rest/v1/ai_models?id=eq.${row.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ params, is_active: true }),
  });
  console.log(row.name, "→", JSON.stringify(patch), up.status);
}
console.log("done");
