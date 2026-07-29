// Corrige o roteamento dos modelos de vídeo no catálogo (ai_models) conforme
// os docs oficiais da PiAPI (verificado em 2026-07). Cada modelo recebe o
// backend real + task_type + output_key + faixa de duração corretos.
//
// LTX não existe na PiAPI → desativado.
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

// patch de params por model_id (todos os model_id abaixo são únicos e ativos)
const MAP = {
  // ── Kling 3.0 (version 3.0, mode std/pro, output.video) ──
  "kling-3.0": {
    backend: "kling",
    task_type: "video_generation",
    kling_version: "3.0",
    kling_mode: "std",
    output_key: "output.video",
    dur_min: 3,
    dur_max: 15,
  },
  "kling-3.0-motion": {
    backend: "kling",
    task_type: "video_generation",
    kling_version: "3.0",
    kling_mode: "std",
    output_key: "output.video",
    dur_min: 3,
    dur_max: 15,
  },
  // ── Kling Omni (omni_video_generation!, output.video) ──
  "kling-omni": {
    backend: "kling",
    task_type: "omni_video_generation",
    kling_version: "3.0",
    output_key: "output.video",
    dur_min: 3,
    dur_max: 15,
    resolution: "720p",
  },
  // ── Kling 2.5 Turbo (backend kling-turbo, output.video_url) ──
  "kling-2.5-turbo": {
    backend: "kling-turbo",
    task_type: "video_generation",
    kling_version: "2.5-turbo",
    output_key: "output.video_url",
    dur_min: 5,
    dur_max: 10,
  },
  // ── Veo 3 (backend veo3, output.video) ──
  "veo-3-fast": {
    backend: "veo3",
    task_type: "veo3-video-fast",
    output_key: "output.video",
    dur_min: 4,
    dur_max: 8,
  },
  "veo-3": {
    backend: "veo3",
    task_type: "veo3-video",
    output_key: "output.video",
    dur_min: 4,
    dur_max: 8,
  },
  // ── Veo 3.1 (backend veo3.1, output.video) ──
  "veo-3.1-quality": {
    backend: "veo3.1",
    task_type: "veo3.1-video",
    output_key: "output.video",
    dur_min: 4,
    dur_max: 8,
  },
  "veo-3.1-fast": {
    backend: "veo3.1",
    task_type: "veo3.1-video-fast",
    output_key: "output.video",
    dur_min: 4,
    dur_max: 8,
  },
  // ── Hailuo MiniMax (v2.3, output.video) ──
  hailuo: {
    backend: "hailuo",
    task_type: "video_generation",
    hailuo_model: "v2.3",
    output_key: "output.video",
    dur_min: 6,
    dur_max: 10,
  },
  "hailuo-live": {
    backend: "hailuo",
    task_type: "video_generation",
    hailuo_model: "v2.3-fast",
    output_key: "output.video",
    dur_min: 6,
    dur_max: 10,
  },
  // ── Seedance (backend seedance, output.video_url) — CRITICAL FIX ──
  "seedance-2.0": {
    backend: "seedance",
    task_type: "seedance-2",
    output_key: "output.video_url",
    dur_min: 4,
    dur_max: 15,
  },
  "seedance-2.0-fast": {
    backend: "seedance",
    task_type: "seedance-2-fast",
    output_key: "output.video_url",
    dur_min: 4,
    dur_max: 15,
  },
  "seedance-1.5-pro": {
    backend: "seedance",
    task_type: "seedance-2-mini",
    output_key: "output.video_url",
    dur_min: 4,
    dur_max: 15,
  },
  // ── Wan 2.6 (backend Wan, output.video_url) — CRITICAL FIX ──
  "wan-2.1-video": {
    backend: "Wan",
    task_type: "wan26-txt2video",
    output_key: "output.video_url",
    dur_min: 5,
    dur_max: 15,
  },
};

// LTX não existe na PiAPI → desativar
const DISABLE = new Set(["ltx-video", "ltx-fast"]);

const res = await fetch(
  `${URL_}/rest/v1/ai_models?select=id,name,model_id,params&type=eq.video`,
  { headers: H }
);
const rows = await res.json();

for (const row of rows) {
  // desativar LTX
  if (DISABLE.has(row.model_id)) {
    const up = await fetch(`${URL_}/rest/v1/ai_models?id=eq.${row.id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ is_active: false }),
    });
    console.log(row.model_id, "→ DISABLED", up.status);
    continue;
  }

  const patch = MAP[row.model_id];
  if (!patch) continue;

  // spread dos params existentes + patch (limpa campos legados de kling em
  // modelos que deixaram de ser kling)
  const params = { ...(row.params || {}), ...patch };
  if (patch.backend !== "kling" && patch.backend !== "kling-turbo") {
    delete params.kling_version;
    delete params.kling_mode;
  }

  const up = await fetch(`${URL_}/rest/v1/ai_models?id=eq.${row.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ params, is_active: true }),
  });
  console.log(row.model_id, "→", patch.backend, patch.task_type, up.status);
}
console.log("done");
