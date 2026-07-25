// Auditoria 2 — correções no catálogo ai_models (validadas via curl direto na PiAPI):
//  - Hailuo Live: params.hailuo_model "v2.3-fast" (500 error) → "T2V-01-Director" (OK)
//  - Seedance 2.0 / 2.0 Fast / 1.5 Pro: params.output_key "output.video_url" → "output.video"
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

async function getModel(name) {
  const res = await fetch(
    `${URL_}/rest/v1/ai_models?select=id,name,params&name=eq.${encodeURIComponent(name)}`,
    { headers: H }
  );
  const rows = await res.json();
  return rows[0] || null;
}

async function patchParams(name, mutate) {
  const row = await getModel(name);
  if (!row) {
    console.log(`SKIP (not found): ${name}`);
    return;
  }
  const params = { ...(row.params || {}) };
  mutate(params);
  const up = await fetch(`${URL_}/rest/v1/ai_models?id=eq.${row.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ params }),
  });
  console.log(`${name} → ${up.status}`, JSON.stringify(params));
}

// 1) Hailuo Live — hailuo_model correto
await patchParams("Hailuo Live", (p) => {
  p.hailuo_model = "T2V-01-Director";
});

// 2) Seedance — output_key correto
for (const name of ["Seedance 2.0", "Seedance 2.0 Fast", "Seedance 1.5 Pro"]) {
  await patchParams(name, (p) => {
    p.output_key = "output.video";
  });
}

console.log("done");
