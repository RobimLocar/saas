import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { effectiveCost } from "@/lib/credits";
import { PLAN_COST_MULTIPLIER } from "@/lib/constants";
import { getAtlasContract } from "@/lib/atlas/profiles";

// Backends PiAPI realmente integrados e funcionando hoje.
// Cada modelo do catálogo aponta para um deles via params.backend
// (fallback: o próprio model_id).
const WORKING_BACKENDS = [
  "Qubico/flux1-schnell",
  "Qubico/flux1-dev",
  "gpt-image-2",
  "kling",
  "hailuo",
  "luma",
  "Qubico/hunyuan",
  "Qubico/ace-step",
  "music-u",
  "Qubico/diffrhythm",
  "atlas-tts",
  // Vídeo — backends reais da PiAPI (roteados por buildVideoPayload)
  "kling-turbo",
  "seedance",
  "Wan",
  "veo3",
  "veo3.1",
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userPlan: string = user
      ? ((await supabase.from("profiles").select("plan").eq("id", user.id).single()).data
          ?.plan ?? "free")
      : "base"; // "base" não é "free", portanto não aplica surcharge para landing page

    const type = req.nextUrl.searchParams.get("type"); // image | video | audio | null

    let query = supabase
      .from("ai_models")
      .select(
        "id, name, provider, type, model_id, credit_cost, params, min_plan, thumbnail_url, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (type) query = query.eq("type", type);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const models = (data || []).map((m) => {
      const p = (m.params as Record<string, unknown> | null) || {};
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        type: m.type,
        model_id: m.model_id,
        credit_cost: effectiveCost(m.credit_cost, userPlan),
        min_plan: m.min_plan,
        family: (p.family as string) || m.provider || "Outros",
        family_description: (p.family_description as string) || "",
        badge: (p.badge as string) || null,
        // COMPETITOR-VIDEO-01 — metadata do seletor de dois níveis (fonte da verdade
        // no catálogo, não hardcode no componente): badges[], modes[], regra res×dur.
        badges: Array.isArray(p.badges) ? (p.badges as string[]) : null,
        modes: Array.isArray(p.modes) ? (p.modes as string[]) : null,
        resolution_duration_rule: (p.resolution_duration_rule as string) || null,
        // MODEL-PROPERTIES — verdade de capabilities por model+mode (resolver + UI + server).
        resolutions: Array.isArray(p.resolutions) ? (p.resolutions as string[]) : null,
        resolution_by_mode:
          p.resolution_by_mode && typeof p.resolution_by_mode === "object"
            ? (p.resolution_by_mode as Record<string, string[]>)
            : null,
        aspect_ratios: Array.isArray(p.aspect_ratios) ? (p.aspect_ratios as string[]) : null,
        duration_options: Array.isArray(p.duration_options)
          ? (p.duration_options as number[])
          : null,
        duration_by_resolution:
          p.duration_by_resolution && typeof p.duration_by_resolution === "object"
            ? (p.duration_by_resolution as Record<string, number[]>)
            : null,
        audio_mode: (p.audio_mode as string) || null,
        max_reference_images:
          typeof p.max_reference_images === "number" ? p.max_reference_images : null,
        capabilities_by_mode:
          p.capabilities_by_mode && typeof p.capabilities_by_mode === "object"
            ? (p.capabilities_by_mode as Record<string, unknown>)
            : null,
        // MODEL-PROPERTIES — dicas de UI (o servidor re-valida tudo). NÃO expõe
        // atlas_model/atlas_contract (esses permanecem server-only e nunca vêm do browser).
        // runtime_provider habilita a UI Atlas-aware (multi-shot/painel avançado).
        runtime_provider: (p.runtime_provider as string) || null,
        supported_params_by_mode:
          p.supported_params_by_mode && typeof p.supported_params_by_mode === "object"
            ? (p.supported_params_by_mode as Record<string, string[]>)
            : null,
        // §8 — Subjects/elements: capacidade exposta p/ a UI, mas TRAVADA (dormant) até
        // o quote provar paridade de billing. `false` mantém o editor renderizado e desativado.
        elements_billing_verified: p.elements_billing_verified === true,
        // VIDEO-RELIABILITY-01 — legacy oculto: resolvível por id (Flow salvo renderiza),
        // mas o seletor NOVO o filtra. NÃO filtrado no servidor de propósito.
        hidden_from_selector: p.hidden_from_selector === true,
        gen_time: (p.gen_time as string) || null,
        kind: (p.kind as string) || null,
        has_audio: Boolean(p.has_audio),
        resolution: (p.resolution as string) || null,
        duration_range: (p.duration_range as string) || null,
        dur_min: typeof p.dur_min === "number" ? p.dur_min : null,
        dur_max: typeof p.dur_max === "number" ? p.dur_max : null,
        backend: (p.backend as string) || null,
        task_type: (p.task_type as string) || null,
        less_restriction: p.less_restriction === true,
        credit_per_second:
          p.credit_per_second && typeof p.credit_per_second === "object"
            ? Object.fromEntries(
                Object.entries(p.credit_per_second as Record<string, unknown>).map(
                  ([k, v]) => [k, effectiveCost(Number(v) || 0, userPlan)]
                )
              )
            : null,
        thumbnail_url: m.thumbnail_url,
        // ETAPA 2.1 Q2 — dados p/ o card de vídeo exibir o PREÇO REAL (=cobrança).
        // credit_per_second_raw: cps SEM ajuste de plano (o `credit_per_second`
        // acima é ajustado por segundo e é consumido pela página UGC — não mexer).
        // plan_multiplier: o multiplicador do plano do usuário. A UI computa
        // ceil(ceil(rawCps[res]×round(dur)) × plan_multiplier) — mesma fórmula do
        // débito em api/generate/video.
        credit_per_second_raw:
          p.credit_per_second && typeof p.credit_per_second === "object"
            ? Object.fromEntries(
                Object.entries(p.credit_per_second as Record<string, unknown>).map(
                  ([k, v]) => [k, Number(v) || 0]
                )
              )
            : null,
        plan_multiplier: PLAN_COST_MULTIPLIER[userPlan] ?? 1,
        // P5d1b — metadata pública de billing por caractere (TTS). NÃO expõe
        // API key, discount Atlas nem dados internos da conta do provider.
        // A UI usa base_credits_per_kchar (RATE não-ajustado) + plan_multiplier
        // acima para estimar exatamente o mesmo custo que o servidor cobra.
        pricing:
          p.billing_mode === "per_kchar"
            ? {
                mode: "per_kchar",
                base_credits_per_kchar: Number(p.base_credits_per_kchar) || 0,
                max_characters: 5000,
              }
            : null,
        // ETAPA 7.5.1 — Hailuo cobra por (resolução, duração): mapa cru {res:{dur:cr}}.
        // A UI aplica o plan_multiplier (mesma lógica do cps) para exibir o custo real.
        credit_cost_map:
          p.credit_cost_map && typeof p.credit_cost_map === "object"
            ? (p.credit_cost_map as Record<string, Record<string, number>>)
            : null,
        // Disponível se é modelo premium (provider gpt-image/abacus) ou
        // se o backend efetivo (params.backend ?? model_id) está integrado
        available:
          (p.provider as string) === "gpt-image" ||
          (p.provider as string) === "abacus" ||
          // P11a — Atlas runtime explícito + contrato conhecido (sem backend PiAPI fake).
          (p.runtime_provider === "atlas" && !!getAtlasContract(p.atlas_contract as string)) ||
          WORKING_BACKENDS.includes((p.backend as string) || m.model_id),
      };
    });

    return NextResponse.json({ models });
  } catch (err) {
    console.error("[api/models] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
