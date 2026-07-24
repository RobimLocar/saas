import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSpeechAbacus } from "@/lib/abacus/client";
import { findVoice, resolveOpenAiVoice } from "@/lib/tts-voices";

// Cache em memória por voz (o preview é curto e determinístico o suficiente).
const cache = new Map<string, Buffer>();

// GET /api/voices/preview?voice=<voiceId>
// Sintetiza uma amostra curta com a voz escolhida (mesmo motor da geração,
// então o preview corresponde ao resultado real).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const voiceId = req.nextUrl.searchParams.get("voice") || "";
  const voice = findVoice(voiceId);
  const openaiVoice = resolveOpenAiVoice(voiceId);

  try {
    let mp3 = cache.get(voiceId);
    if (!mp3) {
      const name = voice?.name || "this voice";
      mp3 = await generateSpeechAbacus({
        text: `Hi, I'm ${name}. This is a preview of how I sound.`,
        voice: openaiVoice,
        model: "gpt-4o-mini-audio-preview",
      });
      cache.set(voiceId, mp3);
    }
    return new NextResponse(new Uint8Array(mp3), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[voices/preview] Error:", err);
    return NextResponse.json(
      { error: "Não foi possível gerar a prévia da voz" },
      { status: 502 }
    );
  }
}
