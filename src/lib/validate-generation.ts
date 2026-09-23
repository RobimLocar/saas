/**
 * Validações locais de entrada executadas ANTES de qualquer acesso a DB ou débito.
 * Protege contra SSRF e entradas claramente inválidas.
 */

// Hosts/ranges privados proibidos (anti-SSRF)
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,           // link-local (AWS metadata, etc.)
  /^\[::1\]$/,             // IPv6 loopback
  /\.internal$/i,          // hostnames .internal
];

/**
 * Retorna true se a URL é segura para ser enviada ao provider.
 * Exige https. Bloqueia localhost, IPs privados e *.internal.
 */
export function isSafeMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(host)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const VALID_ASPECT_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

export interface GenerationInput {
  aspect_ratio?: unknown;
  duration?: unknown;
  start_image_url?: unknown;
  end_image_url?: unknown;
  reference_image_url?: unknown;       // rotas de imagem usam este campo
  reference_images?: unknown;
  reference_videos?: unknown;
  reference_audios?: unknown;
}

export interface GenerationValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Valida campos de entrada antes do débito.
 * - aspect_ratio (se presente): deve estar na lista suportada.
 * - duration (se presente): número finito entre 1 e 30.
 * - TODA URL de referência deve passar em isSafeMediaUrl.
 */
export function validateGenerationInput(
  input: GenerationInput
): GenerationValidationResult {
  // 1) Colectar todas as URLs
  const urlFields: unknown[] = [
    input.start_image_url,
    input.end_image_url,
    input.reference_image_url,
  ];
  if (Array.isArray(input.reference_images)) urlFields.push(...input.reference_images);
  if (Array.isArray(input.reference_videos)) urlFields.push(...input.reference_videos);
  if (Array.isArray(input.reference_audios)) urlFields.push(...input.reference_audios);

  for (const raw of urlFields) {
    if (raw == null || raw === "") continue;
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    if (!isSafeMediaUrl(url)) {
      return {
        ok: false,
        error: `URL de referência inválida ou não permitida (exige https, sem IPs privados): ${url.slice(0, 80)}`,
      };
    }
  }

  // 2) aspect_ratio
  if (typeof input.aspect_ratio === "string" && input.aspect_ratio.trim()) {
    if (!VALID_ASPECT_RATIOS.includes(input.aspect_ratio.trim())) {
      return {
        ok: false,
        error: `Proporção inválida: "${input.aspect_ratio}". Opções: ${VALID_ASPECT_RATIOS.join(", ")}`,
      };
    }
  }

  // 3) duration
  if (input.duration != null && input.duration !== "") {
    const dur = Number(input.duration);
    if (!Number.isFinite(dur) || dur < 1 || dur > 30) {
      return {
        ok: false,
        error: `Duração inválida: "${input.duration}". Deve ser número entre 1 e 30.`,
      };
    }
  }

  return { ok: true };
}
