import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Upload de mídia de referência (imagem/vídeo/áudio) para o Supabase Storage.
// Recebe multipart FormData { file } e retorna { url } pública — necessária
// porque a PiAPI só aceita URLs públicas (não data-URLs base64).

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_PREFIXES = ["image/", "video/", "audio/"];

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo não enviado" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máx. 20 MB)" },
        { status: 413 }
      );
    }

    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) {
      return NextResponse.json(
        { error: "Tipo de arquivo não suportado" },
        { status: 400 }
      );
    }

    const ext =
      EXT_BY_MIME[mime] ||
      (file.name.includes(".") ? file.name.split(".").pop()! : "bin");
    const kind = mime.split("/")[0]; // image | video | audio
    const path = `${user.id}/references/${kind}/${randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const service = createServiceClient();

    const { error: uploadError } = await service.storage
      .from("uploads")
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      console.error("[api/upload] Storage error:", uploadError.message);
      return NextResponse.json(
        { error: "Falha ao salvar o arquivo" },
        { status: 500 }
      );
    }

    const { data: publicData } = service.storage
      .from("uploads")
      .getPublicUrl(path);

    return NextResponse.json({ url: publicData.publicUrl });
  } catch (err) {
    console.error("[api/upload] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
