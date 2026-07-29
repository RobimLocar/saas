import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { generateImageGptSync } from "@/lib/piapi/client";
import {
  CONTENT_PRESETS,
  buildContentPrompt,
  buildPersonaDescription,
  pickRandomScene,
} from "@/lib/influencer-content-presets";

interface InfluencerContentRow {
  id: string;
  influencer_id: string;
  user_id: string;
  category: string;
  prompt: string;
  image_url: string | null;
  generation_id: string | null;
  caption: string | null;
  format?: string | null;
  created_at: string;
}

type ImageModelRow = {
  id: string;
  name: string;
  model_id: string;
  credit_cost: number;
  params: Record<string, unknown> | null;
};

function clampCount(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(8, Math.round(n)));
}

function normalizeFormat(input: unknown): "9:16" | "1:1" | "16:9" {
  return input === "1:1" || input === "16:9" ? input : "9:16";
}

function pickNanoBananaProModel(models: ImageModelRow[]): ImageModelRow | null {
  const byModelId = models.find((m) => m.model_id === "nano-banana-pro");
  if (byModelId) return byModelId;

  const byName = models.find((m) => /nano banana pro/i.test(m.name));
  if (byName) return byName;

  return null;
}

async function persistImage(
  userId: string,
  generationId: string,
  sourceUrl: string
): Promise<string> {
  const service = createServiceClient();
  const storagePath = `${userId}/influencer-content/${generationId}.png`;

  let buffer: Buffer;
  let contentType = "image/png";

  if (sourceUrl.startsWith("data:")) {
    const [meta, b64] = sourceUrl.split(",");
    contentType = meta.slice(5, meta.indexOf(";")) || "image/png";
    buffer = Buffer.from(b64, "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    contentType = res.headers.get("content-type") || "image/png";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const { error } = await service.storage
    .from("assets")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  const { data } = service.storage.from("assets").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function insertInfluencerContent(
  service: ReturnType<typeof createServiceClient>,
  payload: Omit<InfluencerContentRow, "id" | "created_at" | "format"> & { format: string }
): Promise<InfluencerContentRow> {
  const withFormat = await service
    .from("influencer_content")
    .insert(payload)
    .select("id, influencer_id, user_id, category, prompt, image_url, generation_id, caption, format, created_at")
    .maybeSingle();

  if (!withFormat.error && withFormat.data) {
    return withFormat.data as InfluencerContentRow;
  }

  if (withFormat.error && /format/.test(withFormat.error.message || "")) {
    const { format: _drop, ...withoutFormatPayload } = payload;
    const withoutFormat = await service
      .from("influencer_content")
      .insert(withoutFormatPayload)
      .select("id, influencer_id, user_id, category, prompt, image_url, generation_id, caption, created_at")
      .maybeSingle();

    if (withoutFormat.error || !withoutFormat.data) {
      throw new Error(withoutFormat.error?.message || "Falha ao salvar influencer_content");
    }

    return {
      ...(withoutFormat.data as InfluencerContentRow),
      format: payload.format,
    };
  }

  throw new Error(withFormat.error?.message || "Falha ao salvar influencer_content");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const withFormat = await supabase
      .from("influencer_content")
      .select("id, influencer_id, user_id, category, prompt, image_url, generation_id, caption, format, created_at")
      .eq("influencer_id", influencerId)
      .order("created_at", { ascending: false });

    if (!withFormat.error) {
      return NextResponse.json({ items: withFormat.data ?? [] });
    }

    if (!/format/.test(withFormat.error.message || "")) {
      return NextResponse.json({ error: withFormat.error.message }, { status: 500 });
    }

    const fallback = await supabase
      .from("influencer_content")
      .select("id, influencer_id, user_id, category, prompt, image_url, generation_id, caption, created_at")
      .eq("influencer_id", influencerId)
      .order("created_at", { ascending: false });

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    const normalized = (fallback.data ?? []).map((item) => ({ ...item, format: "9:16" }));
    return NextResponse.json({ items: normalized });
  } catch (err) {
    console.error("[api/influencers/:id/content][GET] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;

    const supabase = await createClient();
    const service = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const selectedCategories = Array.isArray(body?.categories)
      ? body.categories.filter((x: unknown) => typeof x === "string")
      : [];
    const count = clampCount(body?.count);
    const format = normalizeFormat(body?.format);

    if (selectedCategories.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos 1 categoria" }, { status: 400 });
    }

    const presetMap = new Map(CONTENT_PRESETS.map((p) => [p.key, p]));
    for (const key of selectedCategories) {
      if (!presetMap.has(key)) {
        return NextResponse.json({ error: `Categoria inválida: ${key}` }, { status: 400 });
      }
    }

    const { data: influencer, error: influencerErr } = await supabase
      .from("influencers")
      .select("id, user_id, gender, age_range, styles, hair_color, eye_color, additional_details, avatar_image_url")
      .eq("id", influencerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (influencerErr) {
      return NextResponse.json({ error: influencerErr.message }, { status: 500 });
    }

    if (!influencer) {
      return NextResponse.json({ error: "Influencer não encontrado" }, { status: 404 });
    }

    if (!influencer.avatar_image_url) {
      return NextResponse.json(
        { error: "Influencer draft. Selecione um avatar antes de gerar conteúdo." },
        { status: 400 }
      );
    }

    const { data: profile } = await service
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    const { data: imageModels, error: modelErr } = await service
      .from("ai_models")
      .select("id, name, model_id, credit_cost, params")
      .eq("type", "image")
      .eq("is_active", true);

    if (modelErr || !imageModels || imageModels.length === 0) {
      return NextResponse.json({ error: "Modelos de imagem indisponíveis" }, { status: 500 });
    }

    const nanoBananaPro = pickNanoBananaProModel(imageModels as ImageModelRow[]);
    if (!nanoBananaPro) {
      return NextResponse.json({ error: "Modelo Nano Banana Pro não encontrado" }, { status: 404 });
    }

    const unitCost = effectiveCost(nanoBananaPro.credit_cost, profile?.plan ?? "free");
    const totalCost = unitCost * count;
    const available = profile?.credits_balance ?? 0;

    if (available < totalCost) {
      return NextResponse.json(
        { error: "Insufficient credits", required: totalCost, available },
        { status: 402 }
      );
    }

    const persona = buildPersonaDescription(influencer);
    const items: InfluencerContentRow[] = [];

    for (let i = 0; i < count; i++) {
      const categoryKey = selectedCategories[i % selectedCategories.length] as string;
      const preset = presetMap.get(categoryKey)!;
      const scene = pickRandomScene(preset);
      const finalPrompt = buildContentPrompt(persona, scene);

      const generationId = randomUUID();

      await service.from("generations").insert({
        id: generationId,
        user_id: user.id,
        model_id: nanoBananaPro.id,
        type: "image",
        prompt: finalPrompt,
        params: {
          mode: "influencer-content",
          category: categoryKey,
          format,
          aspect_ratio: format,
          reference_image_url: influencer.avatar_image_url,
        },
        status: "pending",
        credits_used: unitCost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const debit = await debitCredits(service, user.id, unitCost, generationId);
      if (!debit.ok) {
        if ("insufficient" in debit && debit.insufficient) {
          return NextResponse.json(
            { error: "Insufficient credits", required: unitCost, available: 0 },
            { status: 402 }
          );
        }
        return NextResponse.json(
          { error: ("error" in debit ? debit.error : "Falha ao debitar créditos") || "Falha ao debitar créditos" },
          { status: 500 }
        );
      }

      try {
        const providerUrl = await generateImageGptSync({
          prompt: finalPrompt,
          aspect_ratio: format,
          quality: "high",
          reference_image_url: influencer.avatar_image_url,
        });

        const finalUrl = await persistImage(user.id, generationId, providerUrl);

        await service
          .from("generations")
          .update({
            status: "completed",
            result_url: finalUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);

        const row = await insertInfluencerContent(service, {
          influencer_id: influencerId,
          user_id: user.id,
          category: categoryKey,
          prompt: finalPrompt,
          image_url: finalUrl,
          generation_id: generationId,
          caption: null,
          format,
        });

        items.push(row);
      } catch (imageErr) {
        await refundCredits(service, user.id, generationId, unitCost);
        await service
          .from("generations")
          .update({
            status: "failed",
            error_message:
              imageErr instanceof Error ? imageErr.message : "Falha ao gerar imagem",
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);
        throw imageErr;
      }
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[api/influencers/:id/content][POST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
