import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, PLANS, TOPUP_PACKS, PlanKey } from "@/lib/stripe/client";

// P7a — Núcleo de processamento do webhook Stripe, isolado da route (Next valida
// os exports de route.ts estritamente). Aqui vivem o mapeamento de plano e os
// grants idempotentes; `processEvent(supabase, event)` recebe o supabase por
// parâmetro para ser testável sem rede.

/** Deriva o plano a partir do price_id (VERDADE do Stripe); desconhecido → null. */
export function planFromPriceId(priceId: string | undefined | null): PlanKey | null {
  if (!priceId) return null;
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.stripe_price_id && plan.stripe_price_id === priceId) return key as PlanKey;
  }
  return null;
}

/**
 * FONTE ÚNICA do grant mensal de subscription = fatura PAGA. checkout.session
 * .completed NÃO concede créditos (só linkage). Plano vem do price_id da
 * subscription (verdade do Stripe), independente da ordem dos eventos.
 *
 * ⚠ `credit_transactions.related_job_id` é UUID e NÃO comporta o invoice.id
 * ("in_..."). Logo NÃO há guarda lógica por fatura em app aqui — a proteção é
 * (a) event.id dedupe em stripe_events + (b) UM único tipo de evento de grant. Se
 * `invoice.paid` também for roteado para cá no futuro, o double-grant volta. A
 * guarda DB (coluna text external_id + UNIQUE) é tarefa do P7b.
 */
// P7b — Só estas billing_reasons representam um NOVO período mensal. Update/
// proration/threshold/manual NÃO concedem um mês cheio de créditos.
const MONTHLY_GRANT_REASONS = new Set(["subscription_create", "subscription_cycle"]);

export async function grantSubscriptionForInvoice(
  supabase: SupabaseClient,
  invoice: { id?: string; subscription?: string | null; billing_reason?: string | null },
  eventId: string
): Promise<void> {
  const subId = invoice.subscription;
  if (!subId) return;

  // P7b — GUARDA de semântica: apenas subscription_create / subscription_cycle
  // concedem o mês. Assim uma fatura de upgrade/proration (subscription_update)
  // NÃO produz um segundo mês cheio. Metadata de plano sincroniza por outros
  // eventos (checkout.session.completed / customer.subscription.updated).
  const reason = invoice.billing_reason || "";
  if (!MONTHLY_GRANT_REASONS.has(reason)) {
    console.warn(
      "[stripe-webhook] invoice grant IGNORADO: billing_reason não-mensal",
      JSON.stringify({ eventId, invoice: invoice.id, billing_reason: reason })
    );
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  const customerId = sub.customer as string;
  const priceId = sub.items.data[0]?.price?.id;

  const plan = planFromPriceId(priceId);
  if (!plan) {
    console.warn(
      "[stripe-webhook] invoice grant IGNORADO: price desconhecido",
      JSON.stringify({ eventId, invoice: invoice.id, priceId })
    );
    return;
  }

  const okStatus = ["active", "trialing", "past_due"].includes(sub.status);
  if (!okStatus) {
    console.warn(
      "[stripe-webhook] invoice grant IGNORADO: status incompatível",
      JSON.stringify({ eventId, invoice: invoice.id, status: sub.status })
    );
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (!profile) {
    console.warn(
      "[stripe-webhook] invoice grant IGNORADO: perfil não encontrado p/ customer",
      JSON.stringify({ eventId, invoice: invoice.id })
    );
    return;
  }

  // P7b — grant ATÔMICO + idempotente por FATURA (external_id = stripe:invoice:<id>).
  // A UNIQUE parcial em external_id garante 1 grant por fatura, mesmo que
  // invoice.payment_succeeded E invoice.paid cheguem (event.ids diferentes, MESMA
  // fatura). Balance+ledger+plano numa única transação DB.
  const externalId = `stripe:invoice:${invoice.id}`;
  const { data, error } = await supabase.rpc("grant_subscription_credits", {
    p_user_id: profile.id,
    p_credits: PLANS[plan].credits,
    p_plan: plan,
    p_external_id: externalId,
  });
  if (error) {
    // Propaga → o handler libera o claim do evento e o Stripe reprocessa.
    throw new Error(`grant_subscription_credits falhou: ${error.message}`);
  }
  if (String(data ?? "") === "ALREADY_APPLIED") {
    console.warn(
      "[stripe-webhook] invoice grant idempotente (já aplicado)",
      JSON.stringify({ eventId, invoice: invoice.id })
    );
  }
}

/**
 * Top-up: concede SOMENTE com pagamento confirmado (payment_status "paid" ou o
 * evento async_payment_succeeded). Créditos vêm do TOPUP_PACKS do servidor (nunca
 * de metadata.credits). Idempotência por sessão via credit_purchases
 * .stripe_session_id UNIQUE (claim-first) — 1 grant por sessão mesmo entre os dois
 * tipos de evento.
 */
export async function grantTopupForSession(
  supabase: SupabaseClient,
  session: {
    id: string;
    mode?: string | null;
    payment_status?: string | null;
    currency?: string | null;
    amount_total?: number | null;
    metadata?: Record<string, string> | null;
  },
  eventId: string
): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") {
    console.warn(
      "[stripe-webhook] topup NÃO pago ainda",
      JSON.stringify({ eventId, session: session.id, payment_status: session.payment_status })
    );
    return;
  }

  const userId = session.metadata?.userId;
  const packId = session.metadata?.pack_id;
  if (!userId) return;

  const pack = TOPUP_PACKS.find((p) => p.id === packId);
  if (!pack) {
    console.warn(
      "[stripe-webhook] topup IGNORADO: pack desconhecido",
      JSON.stringify({ eventId, session: session.id, packId })
    );
    return;
  }

  // Promotion codes NÃO habilitados no checkout → total deve casar EXATO.
  if (typeof session.amount_total === "number" && session.amount_total !== pack.price) {
    console.warn(
      "[stripe-webhook] topup IGNORADO: amount_total ≠ preço do pack",
      JSON.stringify({ eventId, session: session.id, amount_total: session.amount_total, expected: pack.price })
    );
    return;
  }
  if (session.currency && session.currency.toLowerCase() !== "usd") {
    console.warn(
      "[stripe-webhook] topup IGNORADO: moeda inesperada",
      JSON.stringify({ eventId, session: session.id, currency: session.currency })
    );
    return;
  }

  // P7b — grant ATÔMICO + idempotente por SESSÃO via RPC grant_topup_credits:
  // insere credit_purchases (UNIQUE stripe_session_id) + ledger (topup) + incrementa
  // saldo numa ÚNICA transação. Duplicata de sessão (completed + async_succeeded) →
  // ALREADY_APPLIED, sem crédito extra. Elimina o estado parcial do claim-first.
  const { data, error } = await supabase.rpc("grant_topup_credits", {
    p_user_id: userId,
    p_credits: pack.credits,
    p_amount_cents: session.amount_total ?? pack.price,
    p_session_id: session.id,
  });
  if (error) {
    throw new Error(`grant_topup_credits falhou: ${error.message}`);
  }
  if (String(data ?? "") === "ALREADY_APPLIED") {
    console.warn(
      "[stripe-webhook] topup idempotente (sessão já concedida)",
      JSON.stringify({ eventId, session: session.id })
    );
  }
}

/** Roteia um evento Stripe já verificado para o handler correto. */
export async function processEvent(
  supabase: SupabaseClient,
  event: { id: string; type: string; data: { object: unknown } }
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        id: string;
        mode?: string | null;
        payment_status?: string | null;
        currency?: string | null;
        amount_total?: number | null;
        customer?: string | null;
        metadata?: Record<string, string> | null;
      };
      const type = session.metadata?.type;
      const userId = session.metadata?.userId;

      if (type === "subscription") {
        // NÃO concede créditos aqui (fonte única = fatura paga); só linkage.
        if (!userId) break;
        const plan = (session.metadata?.plan as PlanKey) || "starter";
        const monthly = PLANS[plan]?.credits ?? 0;
        await supabase
          .from("profiles")
          .update({
            plan,
            plan_credits_monthly: monthly,
            stripe_customer_id: (session.customer as string) || undefined,
          })
          .eq("id", userId);
        break;
      }

      if (type === "topup") {
        await grantTopupForSession(supabase, session, event.id);
      }
      break;
    }

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as {
        id: string;
        mode?: string | null;
        payment_status?: string | null;
        currency?: string | null;
        amount_total?: number | null;
        metadata?: Record<string, string> | null;
      };
      if (session.metadata?.type === "topup") {
        await grantTopupForSession(supabase, session, event.id);
      }
      break;
    }

    // P7b — invoice.payment_succeeded E invoice.paid roteiam para a MESMA função,
    // com idempotência lógica por fatura (external_id UNIQUE). Assim: se o endpoint
    // envia só o evento legado, funciona; se invoice.paid for habilitado depois,
    // funciona; se AMBOS chegarem para a mesma fatura, concede só UMA vez.
    case "invoice.payment_succeeded":
    case "invoice.paid": {
      const invoice = event.data.object as {
        id?: string;
        subscription?: string | null;
        billing_reason?: string | null;
      };
      await grantSubscriptionForInvoice(supabase, invoice, event.id);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as {
        customer: string;
        items: { data: Array<{ price?: { id?: string } }> };
      };
      const newPlan = planFromPriceId(sub.items.data[0]?.price?.id);
      if (newPlan) {
        await supabase
          .from("profiles")
          .update({ plan: newPlan, plan_credits_monthly: PLANS[newPlan].credits })
          .eq("stripe_customer_id", sub.customer as string);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as { customer: string };
      await supabase
        .from("profiles")
        .update({ plan: "free", plan_credits_monthly: 0 })
        .eq("stripe_customer_id", sub.customer as string);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as { id?: string };
      console.warn(`[stripe-webhook] Pagamento falhou para invoice: ${invoice.id}`);
      break;
    }
  }
}
