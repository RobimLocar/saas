import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";

export async function middleware(request: NextRequest) {
  // 1) Mantém a sessão do Supabase (auth) intacta.
  const response = await updateSession(request);

  // 2) Detecção de idioma: só age se o usuário ainda não escolheu (sem cookie).
  //    Prioridade dentro do resolveLocale: Accept-Language > país (IP) > default.
  const hasCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!hasCookie) {
    const locale = resolveLocale({
      acceptLanguage: request.headers.get("accept-language"),
      country: request.headers.get("x-vercel-ip-country"),
    });
    if (response instanceof NextResponse) {
      response.cookies.set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 ano
        sameSite: "lax",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas exceto arquivos estáticos e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
