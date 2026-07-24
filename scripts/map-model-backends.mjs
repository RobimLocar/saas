// Mapeia todos os modelos do catálogo para backends PiAPI reais (params.backend)
// e reativa modelos do catálogo original. Executar: node scripts/map-model-backends.mjs
import fs from "node:fs";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

// name → { backend, activate?, extra? }
const MAP = {
  // ── Imagem (atlas → Flux real) ──
  "Ideogram v4 Turbo": { backend: "Qubico/flux1-dev" },
  "GPT Image 2": { backend: "Qubico/flux1-dev" },
  "Nano Banana": { backend: "Qubico/flux1-schnell" },
  "Nano Banana Pro": { backend: "Qubico/flux1-dev" },
  "Qwen Image": { backend: "Qubico/flux1-schnell" },
  "Recraft V3": { backend: "Qubico/flux1-dev" },
  "Flux 1.1 Pro": {
    backend: "Qubico/flux1-dev",
    activate: true,
    extra: { family_description: "Fast, high-quality open image generation" },
  },
  // ── Áudio (atlas → ace-step real) ──
  "ElevenLabs Flash": { backend: "Qubico/ace-step" },
  "ElevenLabs Multilingual V2": { backend: "Qubico/ace-step" },
  "ElevenLabs Sound Effects": { backend: "Qubico/ace-step" },
  "ElevenLabs Turbo V2.5": { backend: "Qubico/ace-step" },
  "Suno Música": { backend: "Qubico/ace-step" },
  "MMAudio": {
    backend: "Qubico/ace-step",
    activate: true,
    extra: { family_description: "Sound effects and ambient audio" },
  },
  "Udio Música": {
    backend: "Qubico/ace-step",
    activate: true,
    extra: { family_description: "Full songs with vocals and instruments" },
  },
  // ── Vídeo (reativação de modelos do catálogo original) ──
  "Veo 3": {
    backend: "hailuo",
    activate: true,
    extra: {
      task_type: "video_generation", has_audio: true, resolution: "1080p",
      dur_min: 4, dur_max: 8, duration_range: "4s–8s",
      family_description: "Precision video with sound control",
    },
  },
  "Veo 3 Fast": {
    backend: "hailuo",
    activate: true,
    extra: {
      badge: "FAST", task_type: "video_generation", has_audio: true, resolution: "720p",
      dur_min: 4, dur_max: 8, duration_range: "4s–8s",
      family_description: "Precision video with sound control",
    },
  },
  "Wan 2.1": {
    backend: "kling",
    activate: true,
    extra: {
      task_type: "video_generation", kling_version: "1.6", kling_mode: "standard",
      has_audio: false, resolution: "720p",
      dur_min: 4, dur_max: 10, duration_range: "4s–10s",
      family_description: "Open cinematic video generation",
    },
  },
  "LTX Video": {
    backend: "kling",
    activate: true,
    extra: {
      task_type: "video_generation", kling_version: "1.6", kling_mode: "standard",
      has_audio: false, resolution: "720p",
      dur_min: 4, dur_max: 10, duration_range: "4s–10s",
      family_description: "Ultra-fast affordable video generation",
    },
  },
};

const res = await fetch(`${BASE}/rest/v1/ai_models?select=id,name,type,model_id,is_active,params`, { headers: HEADERS });
const rows = await res.json();

for (const row of rows) {
  const entry = MAP[row.name];
  if (!entry) continue;
  const params = { ...(row.params || {}), ...(entry.extra || {}), backend: entry.backend };
  const patch = { params };
  if (entry.activate) patch.is_active = true;
  const up = await fetch(`${BASE}/rest/v1/ai_models?id=eq.${row.id}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(patch),
  });
  const out = await up.json();
  console.log(`${up.ok ? "OK " : "ERR"} ${row.type} | ${row.name} → backend=${entry.backend}${entry.activate ? " (reativado)" : ""}${up.ok ? "" : " " + JSON.stringify(out)}`);
}
console.log("done");
