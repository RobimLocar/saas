// Adiciona (idempotente) o modelo "Seedance 2.0 — Rosto Real" ao catálogo.
// Usa a variante less-restriction do Seedance para gerações a partir de
// imagens de referência (P0-§2). credit_cost ~10% acima do Seedance 2.0.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : null;
};
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

const NAME = "Seedance 2.0 — Rosto Real";

const params = {
  badge: "REAL",
  family: "Seedance",
  backend: "seedance",
  dur_max: 15,
  dur_min: 4,
  has_audio: true,
  task_type: "seedance-2-less-restriction",
  less_restriction: true,
  seedance_tier: "pro",
  output_key: "output.video",
  resolution: "1080p",
  duration_range: "4s–15s",
  family_description:
    "Vídeo cinematográfico a partir de imagem de referência (variante menos restritiva).",
};

const row = {
  name: NAME,
  provider: "piapi",
  type: "video",
  model_id: "seedance-2.0-less-restriction",
  credit_cost: 75, // ~10% acima do Seedance 2.0 (68)
  params,
  is_active: true,
  min_plan: "free",
  sort_order: 21,
};

(async () => {
  // Idempotência: se já existe, faz PATCH; senão POST.
  const existRes = await fetch(
    `${url}/rest/v1/ai_models?select=id&name=eq.${encodeURIComponent(NAME)}`,
    { headers: h }
  );
  const exist = await existRes.json();
  if (Array.isArray(exist) && exist.length > 0) {
    const id = exist[0].id;
    const r = await fetch(`${url}/rest/v1/ai_models?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify({ credit_cost: row.credit_cost, params, is_active: true }),
    });
    console.log("PATCH", r.status, JSON.stringify(await r.json()));
  } else {
    const r = await fetch(`${url}/rest/v1/ai_models`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    console.log("POST", r.status, JSON.stringify(await r.json()));
  }
})();
