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
        // Atualizar plano e créditos
        await supabase
          .from("profiles")
          .update({
            plan: plan || "starter",
            credits_balance: credits,
            stripe_customer_id: session.customer as string,
          })
          .eq("id", userId);

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          type: "purchase",
          amount: credits,
          balance_after: credits,
          description: `Assinatura ${PLANS[plan]?.name || plan} ativada — ${credits} créditos`,
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
          type: "purchase",
          amount: credits,
          balance_after: newBalance,
          description: `Top-up — +${credits} créditos`,
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
          // Rollover parcial
          const rolloverCap = plan === "agency" ? 500 : plan === "pro" ? 100 : 0;
          const rollover = Math.min(profile.credits_balance, rolloverCap);
          const newBalance = planData.credits + rollover;

          await supabase
            .from("profiles")
            .update({ credits_balance: newBalance })
            .eq("id", profile.id);

          await supabase.from("credit_transactions").insert({
            user_id: profile.id,
            type: "purchase",
            amount: planData.credits,
            balance_after: newBalance,
            description: `Renovação mensal ${planData.name} — ${planData.credits} créditos${rollover > 0 ? ` (+${rollover} rollover)` : ""}`,
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
          .update({ plan: newPlan })
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
        .update({ plan: "free", credits_balance: 10 })
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
