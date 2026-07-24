// Remapeia o catálogo para os backends PiAPI validados em 2026-07-24 (com saldo):
//  - Modelos premium de imagem → gpt-image-2 (síncrono, texto perfeito)
//  - Suno Música / Udio Música → music-u (Udio real na PiAPI)
//  - Wan 2.1 → Qubico/hunyuan (txt2video open-source real)
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

const MAP = {
  "GPT Image 2": { provider: "gpt-image", backend: "gpt-image-2" },
  "Nano Banana": { provider: "gpt-image", backend: "gpt-image-2" },
  "Nano Banana Pro": { provider: "gpt-image", backend: "gpt-image-2" },
  "Ideogram v4 Turbo": { provider: "gpt-image", backend: "gpt-image-2" },
  "Suno Música": { backend: "music-u" },
  "Udio Música": { backend: "music-u" },
  "Wan 2.1": { backend: "Qubico/hunyuan" },
};

const res = await fetch(`${URL_}/rest/v1/ai_models?select=id,name,params`, {
  headers: H,
});
const rows = await res.json();

for (const row of rows) {
  const patch = MAP[row.name];
  if (!patch) continue;
  const params = { ...(row.params || {}), ...patch, is_active: undefined };
  delete params.is_active;
  // provider "abacus" antigo é substituído
  if (patch.provider) params.provider = patch.provider;
  const up = await fetch(`${URL_}/rest/v1/ai_models?id=eq.${row.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ params, is_active: true }),
  });
  console.log(row.name, "→", JSON.stringify(patch), up.status);
}
console.log("done");
