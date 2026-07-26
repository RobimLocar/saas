import type { VideoModelParams } from "@/lib/piapi/client";
import { auditLog } from "@/lib/audit-log";

/**
 * Validações LOCAIS executadas ANTES do débito de créditos (§3.2).
 * Objetivo: rejeitar cedo (HTTP 400) requisições claramente inválidas, sem
 * debitar créditos nem criar task paga na PiAPI. Só bloqueia o que é
 * comprovadamente inválido; o resto é responsabilidade do provider.
 */

// Aspect ratios suportados por família de backend (fallback quando o modelo
// não declara `supported_aspect_ratios` nos params).
const DEFAULT_ASPECTS_BY_BACKEND: Record<string, string[]> = {
  seedance: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  kling: ["16:9", "9:16", "1:1"],
  hailuo: ["16:9", "9:16", "1:1"],
  veo3: ["16:9", "9:16"],
  wan: ["16:9", "9:16", "1:1"],
  ltx: ["16:9", "9:16"],
};

export interface ValidateVideoInput {
  aspect_ratio?: unknown;
  duration?: unknown;
  start_image_url?: unknown;
  end_image_url?: unknown;
  reference_images?: unknown;
  reference_videos?: unknown;
  reference_audios?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

function collectUrls(input: ValidateVideoInput): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) urls.push(v.trim());
  };
  push(input.start_image_url);
  push(input.end_image_url);
  for (const key of ["reference_images", "reference_videos", "reference_audios"] as const) {
    const arr = input[key];
    if (Array.isArray(arr)) arr.forEach(push);
  }
  return urls;
}

/**
 * Faz um HEAD com timeout curto só para observabilidade — NÃO bloqueia a
 * requisição se o HEAD falhar (muitos CDNs recusam HEAD ou exigem GET). Apenas
 * loga o resultado para diagnóstico.
 */
async function probeUrl(url: string, requestId: string, timeoutMs = 3000): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    auditLog("api.generate.video", "url_probe", requestId, {
      url: url.slice(0, 200),
      http_status: res.status,
      ok: res.ok,
    });
  } catch (err) {
    auditLog("api.generate.video", "url_probe_falhou", requestId, {
      url: url.slice(0, 200),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Valida a requisição de vídeo. Retorna { ok:false, error } quando algo é
 * comprovadamente inválido (→ 400). Dispara HEADs de observabilidade em paralelo
 * (sem bloquear a decisão).
 */
export async function validateVideoRequest(
  input: ValidateVideoInput,
  modelParams: VideoModelParams,
  requestId: string
): Promise<ValidationResult> {
  // 1) URLs de referência: precisam ser http(s). URL claramente inválida → 400.
  const urls = collectUrls(input);
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u)) {
      return { ok: false, error: `URL de referência inválida (precisa começar com http/https): ${u.slice(0, 80)}` };
    }
  }

  // 2) aspect_ratio: se enviado, precisa estar na lista suportada pelo modelo.
  if (typeof input.aspect_ratio === "string" && input.aspect_ratio.trim()) {
    const mp = modelParams as VideoModelParams & { supported_aspect_ratios?: string[] };
    const backend = (mp.backend || "").toLowerCase();
    const supported =
      Array.isArray(mp.supported_aspect_ratios) && mp.supported_aspect_ratios.length > 0
        ? mp.supported_aspect_ratios
        : DEFAULT_ASPECTS_BY_BACKEND[backend];
    if (supported && !supported.includes(input.aspect_ratio)) {
      return {
        ok: false,
        error: `Proporção ${input.aspect_ratio} não suportada por este modelo. Opções: ${supported.join(", ")}`,
      };
    }
  }

  // 3) duration: se enviada, precisa estar entre dur_min e dur_max do modelo.
  if (input.duration != null && input.duration !== "") {
    const dur = Number(input.duration);
    if (Number.isFinite(dur)) {
      const durMin = modelParams.dur_min ?? 1;
      const durMax = modelParams.dur_max ?? 60;
      if (dur < durMin || dur > durMax) {
        return {
          ok: false,
          error: `Duração ${dur}s fora do intervalo suportado (${durMin}–${durMax}s).`,
        };
      }
    }
  }

  // HEADs de observabilidade em paralelo — não bloqueiam (timeout 3s cada).
  if (urls.length > 0) {
    await Promise.allSettled(urls.map((u) => probeUrl(u, requestId)));
  }

  return { ok: true };
}
