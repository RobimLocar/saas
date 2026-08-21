import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, PLANS, PlanKey } from "@/lib/stripe/client";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature error:", err);
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // ETAPA 4.1 — IDEMPOTÊNCIA: o Stripe entrega eventos at-least-once (retries).
  // Registramos o event.id na tabela `stripe_events` (PK). Se já existir, é uma
  // reentrega → respondemos 200 sem reprocessar (evita crédito/saldo duplicado).
  {
    const { error: dupErr } = await supabase
      .from("stripe_events")
      .insert({ event_id: event.id });
    if (dupErr) {
      if ((dupErr as { code?: string }).code === "23505") {
        // unique_violation → evento já processado antes.
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Erro inesperado (ex.: tabela ausente) → loga e PROSSEGUE (fail-open, para
      // não perder um crédito legítimo; a proteção volta assim que a tabela existir).
      console.warn("[stripe-webhook] stripe_events insert falhou:", dupErr.message);
    }
  }

  switch (event.type) {
    // ─── Checkout completo (assinatura ou top-up) ────────────
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const type = session.metadata?.type;
      const credits = parseInt(session.metadata?.credits || "0");

      if (!userId) break;

      if (type === "subscription") {
        const plan = session.metadata?.plan as PlanKey;
        // ETAPA 2.1 W5 — PRESERVAR créditos existentes. Antes fazia
        // `credits_balance = credits` (ABSOLUTO), apagando saldo/top-ups/welcome
        // do usuário ao assinar. Agora SOMA os créditos do plano ao saldo atual.
        // Ex.: saldo 1000 + plano 500 → 1500 (não 500).
        const { data: subProfile } = await supabase
          .from("profiles")
          .select("credits_balance")
          .eq("id", userId)
          .single();
        const prevBalance = (subProfile?.credits_balance as number) || 0;
        await supabase
          .from("profiles")
          .update({
            plan: plan || "starter",
            plan_credits_monthly: credits,
            credits_balance: prevBalance + credits,
            stripe_customer_id: session.customer as string,
          })
          .eq("id", userId);

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: credits,
          reason: "subscription",
        });
      }

      if (type === "topup") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits_balance")
          .eq("id", userId)
          .single();

        const newBalance = (profile?.credits_balance || 0) + credits;
        await supabase
          .from("profiles")
          .update({ credits_balance: newBalance })
          .eq("id", userId);

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: credits,
          reason: "topup",
        });

        // Registrar compra avulsa
        await supabase.from("credit_purchases").insert({
          user_id: userId,
          stripe_session_id: session.id,
          credits,
          amount_cents: session.amount_total || 0,
          status: "completed",
        });
      }
      break;
    }

    // ─── Renovação mensal bem-sucedida ───────────────────────
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as unknown as { subscription?: string };
      if (!invoice.subscription) break;

      const sub = await stripe.subscriptions.retrieve(
        invoice.subscription as string
      );
      const customerId = sub.customer as string;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, plan, credits_balance")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile && profile.plan && profile.plan !== "free") {
        const plan = profile.plan as PlanKey;
        const planData = PLANS[plan];
        if (planData) {
          // ETAPA 2.1 W5 — na renovação, PRESERVAR o saldo existente e SOMAR o
          // grant mensal do plano. Antes: `planData.credits + min(saldo, cap)`,
          // que apagava top-ups/welcome acima do cap (agency 1000 / pro 200 /
          // starter 0) — contradizendo "top-ups não expiram". Como o schema tem
          // só um `credits_balance` (sem bucket separado de top-up), o cap
          // numérico foi removido para NÃO apagar créditos legítimos. Um cap
          // preciso por bucket exige coluna `topup_credits` (proposto, fora de
          // escopo). Ver relatório §2.
          const newBalance = profile.credits_balance + planData.credits;

          await supabase
            .from("profiles")
            .update({ credits_balance: newBalance })
            .eq("id", profile.id);

          await supabase.from("credit_transactions").insert({
            user_id: profile.id,
            amount: planData.credits,
            reason: "subscription",
          });
        }
      }
      break;
    }

    // ─── Upgrade/Downgrade de plano ──────────────────────────
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const customerId = sub.customer as string;

      // Identificar plano pelo price_id
      const priceId = sub.items.data[0]?.price?.id;
      let newPlan: PlanKey | null = null;
      for (const [key, plan] of Object.entries(PLANS)) {
        if (plan.stripe_price_id === priceId) {
          newPlan = key as PlanKey;
          break;
        }
      }

      if (newPlan) {
        await supabase
          .from("profiles")
          .update({ plan: newPlan, plan_credits_monthly: PLANS[newPlan].credits })
          .eq("stripe_customer_id", customerId);
      }
      break;
    }

    // ─── Cancelamento de assinatura ──────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = sub.customer as string;

      await supabase
        .from("profiles")
        .update({ plan: "free", plan_credits_monthly: 0 })
        .eq("stripe_customer_id", customerId);
      break;
    }

    // ─── Falha de pagamento ──────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.warn(`[stripe-webhook] Pagamento falhou para invoice: ${invoice.id}`);
      // TODO: enviar email de aviso via Resend
      break;
    }
  }

  return NextResponse.json({ received: true });
}
