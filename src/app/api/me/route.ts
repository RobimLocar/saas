import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/me — saldo de créditos e plano do usuário logado (usado pelo dock)
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      credits: profile?.credits_balance ?? 0,
      plan: profile?.plan ?? "free",
    });
  } catch (err) {
    console.error("[api/me] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
