import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { debitCredits, effectiveCost, refundCredits } from "@/lib/credits";
import { generateImageGptSync } from "@/lib/piapi/client";
import { isSafeMediaUrl } from "@/lib/validate-generation";
import { auditLog, newRequestId } from "@/lib/audit-log";

type ImageModelRow = {
  id: string;
  name: string;
  model_id: string;
  credit_cost: number;
  params: Record<string, unknown> | null;
};

function buildPortraitPrompt(input: {
  gender: string;
  ageRange: string;
  hairColor: string;
  eyeColor: string;
  styles: string[];
  additionalDetails?: string;
}) {
  const styleText = input.styles.join(", ");
  const details = input.additionalDetails?.trim();
  return `ultra-realistic portrait photo of a ${input.ageRange} ${input.gender}, ${input.hairColor} hair, ${input.eyeColor} eyes, ${styleText} aesthetic.${details ? ` ${details}.` : ""} Neutral studio background, looking at camera, natural lighting, photorealistic.`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function normalizeHandle(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `@${slug || "influencer"}`;
}

function pickPreferredModel(models: ImageModelRow[]): ImageModelRow | null {
  const byGpt = models.find((m) => m.model_id === "gpt-image-2");
  if (byGpt) return byGpt;

  const byNanoPro = models.find((m) => m.model_id === "nano-banana-pro");
  if (byNanoPro) return byNanoPro;

  const byProvider = models.find((m) => {
    const provider = (m.params?.provider as string | undefined) || "";
    return provider === "gpt-image" || provider === "abacus";
  });
  if (byProvider) return byProvider;

  return models[0] ?? null;
}

async function persistImage(
  userId: string,
  generationId: string,
  sourceUrl: string
): Promise<string> {
  const service = createServiceClient();
  const storagePath = `${userId}/influencers/${generationId}.png`;

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

export async function POST(req: NextRequest) {
  const requestId = newRequestId();

  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();

    const influencerIdRaw =
      typeof body?.influencer_id === "string" ? body.influencer_id.trim() : "";

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const gender = typeof body?.gender === "string" ? body.gender.trim() : "";
    const ageRange = typeof body?.age_range === "string" ? body.age_range.trim() : "";
    const styles = normalizeStringArray(body?.styles);
    const hairColor =
      typeof body?.hair_color === "string" ? body.hair_color.trim() : "";
    const eyeColor = typeof body?.eye_color === "string" ? body.eye_color.trim() : "";
    const additionalDetails =
      typeof body?.additional_details === "string"
        ? body.additional_details.trim() || null
        : null;
    const referenceImageUrls = normalizeStringArray(body?.reference_image_urls).slice(0, 8);

    if (!name || !gender || !ageRange || styles.length === 0 || !hairColor || !eyeColor) {
      return NextResponse.json(
        {
          error:
            "Campos obrigatórios: name, gender, age_range, styles, hair_color, eye_color",
        },
        { status: 400 }
      );
    }

    for (const refUrl of referenceImageUrls) {
      if (!isSafeMediaUrl(refUrl)) {
        return NextResponse.json(
          { error: "reference_image_urls contém URL inválida" },
          { status: 400 }
        );
      }
    }

    let influencerId = influencerIdRaw;
    if (influencerId) {
      const { data: existingInfluencer, error: existingInfluencerErr } = await service
        .from("influencers")
        .select("id")
        .eq("id", influencerId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingInfluencerErr) {
        return NextResponse.json({ error: existingInfluencerErr.message }, { status: 500 });
      }

      if (!existingInfluencer) {
        return NextResponse.json({ error: "Influencer não encontrado" }, { status: 404 });
      }
    }

    const promptBase = buildPortraitPrompt({
      gender,
      ageRange,
      hairColor,
      eyeColor,
      styles,
      additionalDetails: additionalDetails || undefined,
    });

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

    const selectedModel = pickPreferredModel(imageModels as ImageModelRow[]);
    if (!selectedModel) {
      return NextResponse.json(
        { error: "Nenhum modelo de imagem disponível" },
        { status: 500 }
      );
    }

    const unitCost = effectiveCost(selectedModel.credit_cost, profile?.plan ?? "free");
    const totalCost = unitCost * 4;
    const available = profile?.credits_balance ?? 0;

    // Pré-check de teto (4x custo) ANTES de disparar em paralelo.
    if (available < totalCost) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: totalCost,
          available,
        },
        { status: 402 }
      );
    }

    auditLog("api.influencers.generate", "precheck_ok", requestId, {
      user_id: user.id,
      influencer_id: influencerId || null,
      model_id: selectedModel.model_id,
      unit_cost: unitCost,
      total_cost: totalCost,
      available,
    });

    const generateOneCandidate = async (index: number): Promise<string> => {
      const generationId = randomUUID();

      const { error: generationInsertError } = await service
        .from("generations")
        .insert({
          id: generationId,
          user_id: user.id,
          model_id: selectedModel.id,
          type: "image",
          prompt: `${promptBase} variation ${index + 1}`,
          params: {
            mode: "influencer-variation",
            variation_index: index + 1,
            aspect_ratio: "1:1",
            reference_image_url: referenceImageUrls[0] || null,
          },
          status: "pending",
          credits_used: unitCost,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (generationInsertError) {
        throw new Error(
          `Erro ao inserir generation (${index + 1}/4): ${generationInsertError.message}`
        );
      }

      const debit = await debitCredits(service, user.id, unitCost, generationId, requestId);
      if (!debit.ok) {
        await service
          .from("generations")
          .update({
            status: "failed",
            error_message:
              "insufficient" in debit && debit.insufficient
                ? "Créditos insuficientes durante o débito por candidato"
                : "Falha ao debitar créditos",
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);

        if ("insufficient" in debit && debit.insufficient) {
          throw new Error("Créditos insuficientes durante o débito por candidato");
        }
        throw new Error("Falha ao debitar créditos");
      }

      try {
        const imagePrompt = `${promptBase} Variation ${index + 1} of 4, slight pose and expression change while keeping identity consistent.`;

        const providerUrl = await generateImageGptSync({
          prompt: imagePrompt,
          aspect_ratio: "1:1",
          quality: "high",
          reference_image_url: referenceImageUrls[0] || undefined,
        });

        const storedUrl = await persistImage(user.id, generationId, providerUrl);

        await service
          .from("generations")
          .update({
            status: "completed",
            result_url: storedUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);

        return storedUrl;
      } catch (candidateErr) {
        await refundCredits(service, user.id, generationId, unitCost, requestId);

        await service
          .from("generations")
          .update({
            status: "failed",
            error_message:
              candidateErr instanceof Error
                ? candidateErr.message
                : "Falha ao gerar variação",
            updated_at: new Date().toISOString(),
          })
          .eq("id", generationId);

        throw candidateErr;
      }
    };

    const settled = await Promise.allSettled(
      [0, 1, 2, 3].map((index) => generateOneCandidate(index))
    );

    const fulfilled = settled
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    const failedCount = settled.length - fulfilled.length;

    if (fulfilled.length === 0) {
      auditLog("api.influencers.generate", "all_failed", requestId, {
        user_id: user.id,
        influencer_id: influencerId || null,
      });
      return NextResponse.json(
        { error: "Falha ao gerar candidatos. Tente novamente." },
        { status: 500 }
      );
    }

    const handle = normalizeHandle(name);

    if (influencerId) {
      const { error: updateErr } = await service
        .from("influencers")
        .update({
          name,
          handle,
          gender,
          age_range: ageRange,
          styles,
          hair_color: hairColor,
          eye_color: eyeColor,
          additional_details: additionalDetails,
          variations: fulfilled,
          avatar_image_url: null,
        })
        .eq("id", influencerId)
        .eq("user_id", user.id);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    } else {
      const { data: influencer, error: influencerError } = await service
        .from("influencers")
        .insert({
          user_id: user.id,
          name,
          handle,
          gender,
          age_range: ageRange,
          styles,
          hair_color: hairColor,
          eye_color: eyeColor,
          additional_details: additionalDetails,
          variations: fulfilled,
          avatar_image_url: null,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (influencerError || !influencer) {
        return NextResponse.json(
          { error: influencerError?.message || "Erro ao criar influencer" },
          { status: 500 }
        );
      }

      influencerId = influencer.id;
    }

    return NextResponse.json({
      influencer_id: influencerId,
      variations: fulfilled,
      generated_count: fulfilled.length,
      failed_count: failedCount,
    });
  } catch (err) {
    console.error("[api/influencers/generate][POST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
