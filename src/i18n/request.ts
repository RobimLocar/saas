import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, defaultLocale, isLocale, resolveLocale } from "./config";

// Config por requisição (App Router, sem prefixo de URL).
// O locale vem do cookie NEXT_LOCALE; se ainda não existir (primeiro acesso
// antes do middleware setar), cai para Accept-Language / país.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  if (!isLocale(cookieLocale)) {
    const hdrs = await headers();
    locale = resolveLocale({
      acceptLanguage: hdrs.get("accept-language"),
      country: hdrs.get("x-vercel-ip-country"),
    });
  }

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages };
});
