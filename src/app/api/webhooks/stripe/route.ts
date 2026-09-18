import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/client";
import { processEvent } from "@/lib/stripe/webhook-processor";

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

  // ── CLAIM do evento (idempotência at-least-once) ───────────────────────────
  // P7a — o Stripe entrega eventos ao menos uma vez (retries). Registramos o
  // event.id (PK) como CLAIM. Reentrega → 200 sem reprocessar. Erro de STORAGE
  // (ex.: tabela ausente/indisponível) → FAIL-CLOSED (500), NUNCA processa sem
  // dedupe (antes o código seguia em frente = risco de grant duplicado).
  {
    const { error: claimErr } = await supabase
      .from("stripe_events")
      .insert({ event_id: event.id });
    if (claimErr) {
      if ((claimErr as { code?: string }).code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error(
        "[stripe-webhook] CRITICAL: claim de stripe_events falhou (fail-closed):",
        JSON.stringify({ eventId: event.id, type: event.type, error: claimErr.message })
      );
      return NextResponse.json({ error: "Erro de idempotência" }, { status: 500 });
    }
  }

  // ── PROCESSA; em falha, LIBERA o claim para o Stripe reprocessar no retry ───
  try {
    await processEvent(supabase, event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { error: relErr } = await supabase
      .from("stripe_events")
      .delete()
      .eq("event_id", event.id);
    if (relErr) {
      console.error(
        "[stripe-webhook] CRITICAL: falha ao liberar claim após erro de processamento",
        JSON.stringify({ eventId: event.id, type: event.type, releaseError: relErr.message, procError: msg })
      );
    } else {
      console.error(
        "[stripe-webhook] processamento falhou; claim liberado p/ retry",
        JSON.stringify({ eventId: event.id, type: event.type, error: msg })
      );
    }
    return NextResponse.json({ error: "Falha ao processar evento" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
