import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PLANS, TOPUP_PACKS, PlanKey } from "@/lib/stripe/client";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { plan, topup_pack_id } = await req.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Buscar perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    // Criar ou buscar customer no Stripe
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // ─── Assinatura ─────────────────────────────────
    if (plan && plan in PLANS) {
      const planData = PLANS[plan as PlanKey];

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: planData.stripe_price_id, quantity: 1 }],
        success_url: `${appUrl}/studio?upgraded=true`,
        cancel_url: `${appUrl}/pricing`,
        metadata: {
          userId: user.id,
          type: "subscription",
          plan: plan,
          credits: String(planData.credits),
        },
      });

      return NextResponse.json({ url: session.url });
    }

    // ─── Top-up ─────────────────────────────────────
    if (topup_pack_id) {
      const pack = TOPUP_PACKS.find((p) => p.id === topup_pack_id);
      if (!pack) {
        return NextResponse.json({ error: "Pack não encontrado" }, { status: 404 });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [{ price: pack.stripe_price_id, quantity: 1 }],
        success_url: `${appUrl}/studio?topup=true`,
        cancel_url: `${appUrl}/pricing`,
        metadata: {
          userId: user.id,
          type: "topup",
          credits: String(pack.credits),
          pack_id: pack.id,
        },
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "Plano ou pack obrigatório" }, { status: 400 });
  } catch (err) {
    console.error("[stripe/create-checkout] Error:", err);
    return NextResponse.json({ error: "Erro ao criar checkout" }, { status: 500 });
  }
}
