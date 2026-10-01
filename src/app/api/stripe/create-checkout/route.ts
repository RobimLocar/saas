import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  stripe,
  PLANS,
  TOPUP_PACKS,
  PlanKey,
  PIX_EXPIRES_AFTER_SECONDS,
  currencyForCountry,
} from "@/lib/stripe/client";
import { stripeReturnBaseUrl } from "@/lib/stripe/app-url";

// Recarga em BRL: o Stripe não aceitou currency_options BRL nos prices avulsos
// existentes (só nos recorrentes). Então a linha em BRL é montada aqui, no
// MESMO produto do price em USD, com o valor da tabela do servidor
// (TOPUP_PACKS.price_brl). O webhook confere moeda + valor exato do pack.
// USD continua usando o price id configurado na Vercel.
const productIdByPrice = new Map<string, string>();

async function topupLineItem(pack: (typeof TOPUP_PACKS)[number], currency: "usd" | "brl") {
  if (currency !== "brl") return { price: pack.stripe_price_id, quantity: 1 };
  let product = productIdByPrice.get(pack.stripe_price_id);
  if (!product) {
    const price = await stripe.prices.retrieve(pack.stripe_price_id);
    product = typeof price.product === "string" ? price.product : price.product.id;
    productIdByPrice.set(pack.stripe_price_id, product);
  }
  return {
    price_data: { currency: "brl", unit_amount: pack.price_brl, product },
    quantity: 1,
  };
}

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
    const appUrl = stripeReturnBaseUrl();
    if (!appUrl) {
      console.error("[stripe/create-checkout] NEXT_PUBLIC_APP_URL ausente em produção");
      return NextResponse.json(
        { error: "Pagamento indisponível no momento. Tente novamente em alguns minutos." },
        { status: 503 }
      );
    }

    // País pela borda da Vercel → moeda (BRL só com STRIPE_BRL_ENABLED=true).
    const country = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
    const currency = currencyForCountry(country);

    // Buscar perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, plan")
      .eq("id", user.id)
      .single();

    // P7a — GUARDA de subscription duplicada: se o usuário JÁ tem um plano pago,
    // não abrir outro checkout de assinatura (evita duas subscriptions ativas =
    // cobrança dupla + grant duplicado). Upgrade/downgrade deve ir pelo Portal
    // (P7b) ou por mudança de subscription no Stripe. Top-ups seguem permitidos.
    // LIMITAÇÃO conhecida (documentada): dois checkouts abertos ANTES de qualquer
    // um concluir ainda são possíveis sem um lock de checkout pendente — fora do
    // escopo P7a (não vale um sistema de lock agora).
    if (plan && plan in PLANS && profile?.plan && profile.plan !== "free") {
      return NextResponse.json(
        { error: "Você já possui um plano ativo. Gerencie sua assinatura para trocar de plano." },
        { status: 409 }
      );
    }

    // Criar ou buscar customer no Stripe
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // profiles não tem policy de UPDATE para authenticated (só
      // profiles_select_own) — usar service role, mesmo padrão de toda
      // outra escrita privilegiada em profiles (webhook-processor.ts,
      // credits.ts). Um update via client authenticated aqui seria um
      // no-op silencioso sob RLS (0 linhas afetadas, sem erro).
      const service = createServiceClient();
      const { error: customerIdErr } = await service
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (customerIdErr) {
        console.error("[stripe/create-checkout] Falha ao salvar stripe_customer_id:", customerIdErr);
      }
    }

    // ─── Assinatura ─────────────────────────────────
    if (plan && plan in PLANS) {
      const planData = PLANS[plan as PlanKey];
      // Preço vazio = variável STRIPE_*_PRICE_ID ausente no deploy (ex.: criada
      // depois do último deploy). Falha clara em vez de erro opaco do Stripe.
      if (!planData.stripe_price_id) {
        console.error("[stripe/create-checkout] price id do plano ausente", JSON.stringify({ plan }));
        return NextResponse.json(
          { error: "Este plano está indisponível no momento. Tente novamente em alguns minutos." },
          { status: 503 }
        );
      }

      // Assinatura: só cartão, com 3D Secure SEMPRE que o banco suportar
      // (validação no app do banco + responsabilidade da fraude com o emissor).
      // O Radar da conta é o padrão (sem regras de 3DS), por isso pedimos aqui.
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        currency,
        line_items: [{ price: planData.stripe_price_id, quantity: 1 }],
        payment_method_types: ["card"],
        payment_method_options: { card: { request_three_d_secure: "any" } },
        success_url: `${appUrl}/studio?upgraded=true`,
        cancel_url: `${appUrl}/pricing`,
        metadata: {
          userId: user.id,
          type: "subscription",
          plan: plan,
          credits: String(planData.credits),
          currency,
          ip_country: country,
        },
        subscription_data: { metadata: { userId: user.id, plan } },
      });

      return NextResponse.json({ url: session.url });
    }

    // ─── Top-up ─────────────────────────────────────
    if (topup_pack_id) {
      const pack = TOPUP_PACKS.find((p) => p.id === topup_pack_id);
      if (!pack) {
        return NextResponse.json({ error: "Pack não encontrado" }, { status: 404 });
      }
      if (!pack.stripe_price_id) {
        console.error("[stripe/create-checkout] price id do pack ausente", JSON.stringify({ pack: pack.id }));
        return NextResponse.json(
          { error: "Este pacote está indisponível no momento. Tente novamente em alguns minutos." },
          { status: 503 }
        );
      }

      // Recarga no Brasil: SÓ Pix (sem chargeback de cartão; créditos só entram
      // quando o Pix é pago — evento async_payment_succeeded). Fora do Brasil:
      // cartão em USD com 3D Secure sempre que o banco suportar.
      const methods =
        currency === "brl"
          ? {
              payment_method_types: ["pix"] as ["pix"],
              payment_method_options: { pix: { expires_after_seconds: PIX_EXPIRES_AFTER_SECONDS } },
            }
          : {
              payment_method_types: ["card"] as ["card"],
              payment_method_options: { card: { request_three_d_secure: "any" as const } },
            };

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        currency,
        line_items: [await topupLineItem(pack, currency)],
        ...methods,
        success_url: `${appUrl}/studio?topup=true`,
        cancel_url: `${appUrl}/pricing`,
        metadata: {
          userId: user.id,
          type: "topup",
          credits: String(pack.credits),
          pack_id: pack.id,
          currency,
          ip_country: country,
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
