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
  resolution?: unknown;
  shots?: unknown;
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

  // 4) resolution: gating AUTORITATIVO por backend (P6b). Rejeita a combinação
  //    (resolução × duração) que o provider NÃO executa — em vez de rebaixar em
  //    silêncio, como o adapter fazia (ex.: Hailuo 1080p+10s virava 768p sem aviso).
  //    Só cobre o que é comprovadamente impossível no provider; o resto segue.
  if (typeof input.resolution === "string" && input.resolution.trim()) {
    const backend = (modelParams.backend || "").toLowerCase();
    const taskType = (modelParams.task_type || "").toLowerCase();
    const resStr = input.resolution.toLowerCase();
    const wants480 = resStr.includes("480");
    const wants1080 = resStr.includes("1080");

    if (backend === "hailuo") {
      // Hailuo (MiniMax) executa apenas 768p e 1080p; 1080p SÓ com duração
      // efetiva de 6s (o provider mapeia duração para 6|10 e não tem 1080p+10s).
      if (wants480) {
        return { ok: false, error: "Hailuo não suporta 480p. Use 768p/720p ou 1080p." };
      }
      if (wants1080) {
        const dur = Number(input.duration);
        // Mesma regra do adapter/billing: duração ≤ 8 → 6s; senão → 10s.
        const effectiveDur = Number.isFinite(dur) && dur > 0 ? (dur <= 8 ? 6 : 10) : 6;
        if (effectiveDur !== 6) {
          return {
            ok: false,
            error: "Hailuo 1080p está disponível apenas com duração de 6s. Selecione 6s ou use 768p/720p.",
          };
        }
      }
    } else if (
      // Kling padrão (3.0 / Omni / 2.5 Turbo) executa 720p e 1080p — nunca 480p.
      // Avatar e Motion Control têm resolução derivada do modo (fora do escopo P6b).
      (backend === "kling" || backend === "kling-turbo") &&
      taskType !== "avatar" &&
      taskType !== "motion_control"
    ) {
      if (wants480) {
        return { ok: false, error: "Kling não suporta 480p. Use 720p ou 1080p." };
      }
    }
  }

  // 5) multishot (Kling 3.0): count ≤ 6 e soma das durações ≤ 15s. Acima disso o
  //    provider rejeita — bloqueia ANTES do débito em vez de cobrar uma task que
  //    falharia. Autoritativo: espelha as travas da UI (Studio) no servidor.
  if (Array.isArray(input.shots) && input.shots.length > 0) {
    const shots = input.shots as Array<{ duration?: unknown }>;
    if (shots.length > 6) {
      return { ok: false, error: `Máximo de 6 shots por vídeo (recebido: ${shots.length}).` };
    }
    let totalSeconds = 0;
    for (const s of shots) {
      const d = Number(s?.duration);
      if (Number.isFinite(d) && d > 0) totalSeconds += d;
    }
    if (totalSeconds > 15) {
      return {
        ok: false,
        error: `A soma das durações dos shots (${totalSeconds}s) excede o máximo de 15s.`,
      };
    }
  }

  // HEADs de observabilidade em paralelo — não bloqueiam (timeout 3s cada).
  if (urls.length > 0) {
    await Promise.allSettled(urls.map((u) => probeUrl(u, requestId)));
  }

  return { ok: true };
}
