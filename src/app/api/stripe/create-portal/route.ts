import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// P7c — Customer Portal (Stripe). Gerenciamento self-service de assinatura:
// método de pagamento, faturas, cancelamento e (se habilitado no Dashboard) troca
// de plano. As alterações do portal voltam pela via de WEBHOOKS (subscription
// .updated/.deleted), já tratadas por P7a/P7b — o app não muda estado aqui.
//
// SEGURANÇA: o customer id vem SEMPRE do perfil autenticado no servidor; NUNCA do
// corpo/browser. return_url é derivado de env confiável.
export async function POST() {
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
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Nenhuma assinatura para gerenciar. Assine um plano primeiro." },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/studio`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/create-portal] Error:", err);
    return NextResponse.json({ error: "Erro ao abrir o portal de cobrança" }, { status: 500 });
  }
}
