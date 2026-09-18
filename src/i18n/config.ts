// Configuração central de idiomas (next-intl em modo cookie, sem prefixo de URL).
// O dashboard é traduzido; os PROMPTS enviados às IAs ficam sempre em inglês.

export const locales = ["pt", "en", "es", "fr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "pt";

// Nome do cookie que guarda a escolha do usuário.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Rótulos exibidos no seletor de idioma.
export const localeLabels: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  fr: "Français",
};

export const localeFlags: Record<Locale, string> = {
  pt: "🇧🇷",
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
};

// html lang correto por locale.
export const htmlLang: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en",
  es: "es",
  fr: "fr",
};

// Mapa país (ISO-2, vindo do geo da Vercel) → locale. Usado só como reforço
// quando o Accept-Language não é conclusivo.
const countryToLocale: Record<string, Locale> = {
  BR: "pt",
  PT: "pt",
  AO: "pt",
  MZ: "pt",
  US: "en",
  GB: "en",
  CA: "en",
  AU: "en",
  IE: "en",
  NZ: "en",
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  EC: "es",
  UY: "es",
  BO: "es",
  PY: "es",
  GT: "es",
  CR: "es",
  DO: "es",
  FR: "fr",
  BE: "fr",
  LU: "fr",
  MC: "fr",
  SN: "fr",
  CI: "fr",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// Resolve o melhor locale a partir dos sinais disponíveis.
// Prioridade: cookie (escolha manual) > Accept-Language > país (IP) > default.
export function resolveLocale(opts: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}): Locale {
  const { cookie, acceptLanguage, country } = opts;

  if (isLocale(cookie)) return cookie;

  const fromHeader = parseAcceptLanguage(acceptLanguage);
  if (fromHeader) return fromHeader;

  if (country) {
    const byCountry = countryToLocale[country.toUpperCase()];
    if (byCountry) return byCountry;
  }

  return defaultLocale;
}

// Lê o Accept-Language e retorna o primeiro idioma suportado (respeitando q-values).
function parseAcceptLanguage(header?: string | null): Locale | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((chunk) => {
      const [tag, q] = chunk.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of parts) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
