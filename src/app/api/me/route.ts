import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getFreeImageTrialStatus } from "@/lib/trials";

// GET /api/me — saldo, plano e estado do teste grátis do usuário logado (usado pelo dock)
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

    // GROWTH-02 — estado do teste grátis (1 imagem por e-mail). E-mail vem da
    // SESSÃO (nunca do browser) → sem enumeração. 'available' | 'claimed' | 'used'.
    // 'available' significa que ainda há 1 imagem grátis; qualquer outro = indisponível.
    const trialStatus = await getFreeImageTrialStatus(createServiceClient(), user.email);
    const imageTrialAvailable = trialStatus === "available";

    return NextResponse.json({
      credits: profile?.credits_balance ?? 0,
      plan: profile?.plan ?? "free",
      image_trial: trialStatus,
      image_trial_available: imageTrialAvailable,
    });
  } catch (err) {
    console.error("[api/me] Error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
