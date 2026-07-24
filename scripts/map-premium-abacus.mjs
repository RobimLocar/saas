// Mapeia os modelos PREMIUM de imagem para o provider Abacus (RouteLLM),
// que serve os modelos reais (gpt_image2, nano_banana, ideogram) com
// qualidade de texto perfeita — em vez do fallback Flux da PiAPI.
// Idempotente: pode rodar quantas vezes quiser.
import fs from "node:fs";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// name (ai_models.name) → modelo real no RouteLLM
const MAP = {
  "GPT Image 2": "gpt_image2",
  "Nano Banana": "nano_banana",
  "Nano Banana Pro": "nano_banana_pro",
  "Ideogram v4 Turbo": "ideogram",
};

const res = await fetch(`${URL_}/rest/v1/ai_models?type=eq.image&select=id,name,params`, { headers: H });
const models = await res.json();

for (const m of models) {
  const abacusModel = MAP[m.name];
  if (!abacusModel) continue;
  const params = { ...(m.params || {}), provider: "abacus", abacus_model: abacusModel };
  const r = await fetch(`${URL_}/rest/v1/ai_models?id=eq.${m.id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ params, is_active: true }),
  });
  console.log(`${m.name} → abacus:${abacusModel} (${r.status})`);
}
console.log("done");
