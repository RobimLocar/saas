import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { voicePreviewUrl, DEFAULT_VOICE_ID } from "@/lib/tts-voices";

// GET /api/voices/preview?voice=<voiceId>
// Redireciona para a amostra oficial da voz hospedada pelo Atlas. Assim o botão
// ▶ do seletor toca exatamente o timbre da voz, sem custo de API nem geração.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const voiceId = req.nextUrl.searchParams.get("voice") || "";
  const url = voicePreviewUrl(voiceId) || voicePreviewUrl(DEFAULT_VOICE_ID);

  if (!url) {
    return NextResponse.json(
      { error: "Prévia indisponível para esta voz" },
      { status: 404 }
    );
  }

  return NextResponse.redirect(url, 307);
}
