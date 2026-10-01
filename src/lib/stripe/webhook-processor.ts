import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, PLANS, TOPUP_PACKS, PlanKey, packAmount } from "@/lib/stripe/client";

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
  invoice: {
    id?: string;
    subscription?: string | null;
    billing_reason?: string | null;
    parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  },
  eventId: string
): Promise<void> {
  // Formato antigo (webhook em 2023-10-16): invoice.subscription. Formato novo
  // (basil+): invoice.parent.subscription_details.subscription. Aceita os dois
  // para não parar de conceder créditos se a versão do endpoint for atualizada.
  const subId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
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

  // Moeda aceita: USD (cartão, fora do Brasil) ou BRL (Pix, Brasil). Qualquer
  // outra (ex.: conversão automática do Adaptive Pricing) é recusada.
  const currency = (session.currency || "usd").toLowerCase();
  const expected = packAmount(pack, currency);
  if (expected === null) {
    console.warn(
      "[stripe-webhook] topup IGNORADO: moeda inesperada",
      JSON.stringify({ eventId, session: session.id, currency: session.currency })
    );
    return;
  }
  // Promotion codes NÃO habilitados no checkout → total deve casar EXATO.
  if (typeof session.amount_total === "number" && session.amount_total !== expected) {
    console.warn(
      "[stripe-webhook] topup IGNORADO: amount_total ≠ preço do pack",
      JSON.stringify({ eventId, session: session.id, currency, amount_total: session.amount_total, expected })
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
    p_amount_cents: session.amount_total ?? expected,
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

// ── Reembolso, contestação e alerta de fraude ───────────────────────────────
// Quando o dinheiro volta, os créditos daquela compra voltam junto (saldo pode
// ficar negativo). Contestação e alerta de fraude também bloqueiam a conta
// para novas gerações (profiles.billing_hold) até a contestação ser ganha.

type Ref = string | { id: string } | null | undefined;
const idOf = (r: Ref): string | null => (typeof r === "string" ? r : r?.id ?? null);

type ChargeLike = {
  id: string;
  amount?: number | null;
  amount_refunded?: number | null;
  customer?: Ref;
  payment_intent?: Ref;
  invoice?: Ref;
};

/**
 * Encontra a linha de grant (external_id) da compra que gerou a cobrança.
 * Top-up → 'stripe:checkout:<session>'; assinatura → 'stripe:invoice:<invoice>'.
 * Funciona com os dois formatos de API (charge.invoice só existe nos antigos).
 */
export async function resolveGrantExternalId(charge: ChargeLike): Promise<string | null> {
  const invoiceId = idOf(charge.invoice);
  if (invoiceId) return `stripe:invoice:${invoiceId}`;
  const pi = idOf(charge.payment_intent);
  if (!pi) return null;

  const sessions = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
  const session = sessions.data[0];
  if (session && session.mode === "payment") return `stripe:checkout:${session.id}`;

  const payments = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: pi },
    limit: 1,
  });
  const inv = idOf(payments.data[0]?.invoice as Ref);
  return inv ? `stripe:invoice:${inv}` : null;
}

async function holdByCustomer(
  supabase: SupabaseClient,
  customer: Ref,
  reason: string,
  eventId: string
): Promise<void> {
  const customerId = idOf(customer);
  if (!customerId) {
    console.error("[stripe-webhook] CRITICAL: sem customer para bloquear conta", JSON.stringify({ eventId, reason }));
    return;
  }
  const { error } = await supabase
    .from("profiles")
    .update({ billing_hold: true, billing_hold_reason: reason, billing_hold_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId);
  if (error) throw new Error(`bloqueio da conta falhou: ${error.message}`);
}

async function reverseCredits(
  supabase: SupabaseClient,
  charge: ChargeLike,
  opts: { key: string; fraction: number; hold: boolean; holdReason: string | null },
  eventId: string
): Promise<void> {
  const grant = await resolveGrantExternalId(charge);
  if (!grant) {
    console.error(
      "[stripe-webhook] CRITICAL: compra não encontrada para estorno de créditos",
      JSON.stringify({ eventId, charge: charge.id, key: opts.key })
    );
    if (opts.hold) await holdByCustomer(supabase, charge.customer, opts.holdReason || "billing", eventId);
    return;
  }
  const { data, error } = await supabase.rpc("reverse_purchase_credits", {
    p_grant_external_id: grant,
    p_key: opts.key,
    p_fraction: opts.fraction,
    p_hold: opts.hold,
    p_hold_reason: opts.holdReason,
  });
  if (error) throw new Error(`reverse_purchase_credits falhou: ${error.message}`);
  const res = String(data ?? "");
  if (res === "GRANT_NOT_FOUND") {
    console.error(
      "[stripe-webhook] CRITICAL: grant não está no extrato",
      JSON.stringify({ eventId, charge: charge.id, grant })
    );
    if (opts.hold) await holdByCustomer(supabase, charge.customer, opts.holdReason || "billing", eventId);
    return;
  }
  console.warn("[stripe-webhook] créditos estornados", JSON.stringify({ eventId, charge: charge.id, grant, key: opts.key, result: res }));
}

/** charge.refunded — retira a fração reembolsada (acumulada) dos créditos. */
export async function handleChargeRefunded(supabase: SupabaseClient, charge: ChargeLike, eventId: string): Promise<void> {
  const amount = charge.amount ?? 0;
  const refunded = charge.amount_refunded ?? 0;
  if (amount <= 0 || refunded <= 0) return;
  await reverseCredits(
    supabase,
    charge,
    { key: `refund:${charge.id}:${refunded}`, fraction: refunded / amount, hold: false, holdReason: null },
    eventId
  );
}

/** charge.dispute.created — retira todos os créditos da compra e bloqueia a conta. */
export async function handleDisputeCreated(
  supabase: SupabaseClient,
  dispute: { id: string; charge?: Ref },
  eventId: string
): Promise<void> {
  const chargeId = idOf(dispute.charge);
  if (!chargeId) return;
  const charge = (await stripe.charges.retrieve(chargeId)) as unknown as ChargeLike;
  await reverseCredits(supabase, charge, { key: `dispute:${dispute.id}`, fraction: 1, hold: true, holdReason: "dispute" }, eventId);
}

/** charge.dispute.closed — contestação ganha devolve os créditos e libera a conta. */
export async function handleDisputeClosed(
  supabase: SupabaseClient,
  dispute: { id: string; charge?: Ref; status?: string | null },
  eventId: string
): Promise<void> {
  if (dispute.status !== "won" && dispute.status !== "warning_closed") {
    console.warn("[stripe-webhook] contestação encerrada sem ganho; conta segue bloqueada", JSON.stringify({ eventId, dispute: dispute.id, status: dispute.status }));
    return;
  }
  const chargeId = idOf(dispute.charge);
  if (!chargeId) return;
  const charge = (await stripe.charges.retrieve(chargeId)) as unknown as ChargeLike;
  const grant = await resolveGrantExternalId(charge);
  if (!grant) return;
  const { error } = await supabase.rpc("reinstate_dispute_credits", {
    p_grant_external_id: grant,
    p_dispute_key: `dispute:${dispute.id}`,
    p_key: `dispute_won:${dispute.id}`,
  });
  if (error) throw new Error(`reinstate_dispute_credits falhou: ${error.message}`);
}

/** radar.early_fraud_warning.created — bandeira de fraude do emissor: estorna e bloqueia. */
export async function handleEarlyFraudWarning(
  supabase: SupabaseClient,
  warning: { id: string; charge?: Ref },
  eventId: string
): Promise<void> {
  const chargeId = idOf(warning.charge);
  if (!chargeId) return;
  const charge = (await stripe.charges.retrieve(chargeId)) as unknown as ChargeLike;
  await reverseCredits(
    supabase,
    charge,
    { key: `efw:${warning.id}`, fraction: 1, hold: true, holdReason: "early_fraud_warning" },
    eventId
  );
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

    case "charge.refunded":
      await handleChargeRefunded(supabase, event.data.object as ChargeLike, event.id);
      break;

    case "charge.dispute.created":
      await handleDisputeCreated(supabase, event.data.object as { id: string; charge?: Ref }, event.id);
      break;

    case "charge.dispute.closed":
      await handleDisputeClosed(
        supabase,
        event.data.object as { id: string; charge?: Ref; status?: string | null },
        event.id
      );
      break;

    case "radar.early_fraud_warning.created":
      await handleEarlyFraudWarning(supabase, event.data.object as { id: string; charge?: Ref }, event.id);
      break;

    case "invoice.payment_failed": {
      const invoice = event.data.object as { id?: string };
      console.warn(`[stripe-webhook] Pagamento falhou para invoice: ${invoice.id}`);
      break;
    }
  }
}
