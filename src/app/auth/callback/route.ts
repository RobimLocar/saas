import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

// Destino dos links enviados por e-mail pelo Supabase (confirmação de conta e
// recuperação de senha). Troca o `code` do link por uma sessão e segue para
// `next` — sempre um caminho interno.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeRedirectPath(url.searchParams.get("next"), "/studio");
  const code = url.searchParams.get("code");

  const fail = (reason: string) => {
    const to = url.clone();
    to.pathname = next === "/reset-password" ? "/forgot-password" : "/login";
    to.search = `?error=${reason}`;
    return NextResponse.redirect(to);
  };

  if (!code) return fail("link_invalido");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("link_expirado");

  const to = url.clone();
  to.pathname = next.split(/[?#]/)[0];
  to.search = "";
  to.hash = "";
  return NextResponse.redirect(to);
}
