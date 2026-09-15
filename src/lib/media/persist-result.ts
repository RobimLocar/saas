import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * P8a — Persistência DURÁVEL de resultados de geração (fonte ÚNICA compartilhada
 * por /api/generate/status e pelo webhook do PiAPI, para não divergirem).
 *
 * INVARIANTE: uma geração só pode ser marcada `completed` quando TODOS os outputs
 * do provider estiverem persistidos em Storage do Fluxyra (URLs próprias, duráveis).
 * NUNCA se cai para a URL temporária do provider (que o PiAPI pode apagar após o
 * período de retenção). Se QUALQUER output falhar em persistir → resultado de
 * falha (o chamador marca `failed` + estorna, via P7b idempotente). All-or-nothing.
 *
 * Naming determinístico + idempotente (upsert): output 0 mantém o path legado
 * `{user}/{type}/{id}.{ext}`; outputs 2+ usam `{...}-{n}.{ext}`. Rerun reescreve os
 * MESMOS paths (sem duplicar). Não expõe internals de bucket ao chamador.
 */

export type PersistOutcome =
  | { ok: true; urls: string[] } // TODAS as URLs são de Storage do Fluxyra; index 0 = primária
  | { ok: false; error: string }; // falha de ENTREGA/persistência (nenhuma URL parcial)

/**
 * P8a — SSRF defense-in-depth mínimo. Após o webhook fail-closed, as URLs vêm de
 * respostas/callbacks AUTENTICADOS do PiAPI, então o risco é baixo; ainda assim
 * rejeitamos esquemas não-http(s) e ALVOS internos por IP LITERAL (loopback/
 * privado/link-local) — barato e sem allowlist de host frágil. NÃO faz resolução
 * DNS (proteção contra DNS-rebinding fica para LATER se o trust boundary mudar).
 */
function isSafeRemoteUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  // IPv6 loopback / link-local / unique-local (host vem entre colchetes na URL).
  if (host === "[::1]" || host.startsWith("[fe80") || host.startsWith("[fc") || host.startsWith("[fd")) {
    return false;
  }
  // IPv4 literal: bloqueia loopback/privado/link-local/this-network.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (
      a === 127 || a === 10 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return false;
    }
  }
  return true;
}

function extFor(type: string): { ext: string; contentType: string } {
  if (type === "image") return { ext: "png", contentType: "image/png" };
  if (type === "video") return { ext: "mp4", contentType: "video/mp4" };
  return { ext: "mp3", contentType: "audio/mpeg" };
}

export async function persistProviderOutputs(
  service: SupabaseClient,
  opts: {
    userId: string;
    generationId: string;
    type: string;
    providerUrls: string[];
  }
): Promise<PersistOutcome> {
  const { userId, generationId, type, providerUrls } = opts;
  if (!providerUrls || providerUrls.length === 0) {
    return { ok: false, error: "nenhum output do provider para persistir" };
  }
  const { ext, contentType: fallbackContentType } = extFor(type);
  const stored: string[] = [];

  for (let i = 0; i < providerUrls.length; i++) {
    const providerUrl = providerUrls[i];
    const storagePath =
      i === 0
        ? `${userId}/${type}/${generationId}.${ext}`
        : `${userId}/${type}/${generationId}-${i + 1}.${ext}`;

    if (!isSafeRemoteUrl(providerUrl)) {
      return { ok: false, error: `URL de output inválida/insegura (output ${i})` };
    }

    try {
      const mediaRes = await fetch(providerUrl);
      if (!mediaRes.ok) {
        return { ok: false, error: `download do output ${i} falhou (HTTP ${mediaRes.status})` };
      }
      const mediaBuffer = await mediaRes.arrayBuffer();

      const { error: uploadError } = await service.storage
        .from("assets")
        .upload(storagePath, Buffer.from(mediaBuffer), {
          contentType: mediaRes.headers.get("content-type") || fallbackContentType,
          upsert: true,
        });
      if (uploadError) {
        return { ok: false, error: `upload do output ${i} falhou: ${uploadError.message}` };
      }

      const { data: publicData } = service.storage.from("assets").getPublicUrl(storagePath);
      if (!publicData?.publicUrl) {
        return { ok: false, error: `sem publicUrl para o output ${i}` };
      }
      // SOMENTE a URL durável de Storage entra no array (jamais a URL do provider).
      stored.push(publicData.publicUrl);
    } catch (err) {
      return {
        ok: false,
        error: `exceção ao persistir output ${i}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { ok: true, urls: stored };
}
