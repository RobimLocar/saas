import Stripe from "stripe";

// Lazy, build-safe init: `new Stripe(...)` só roda no primeiro acesso real
// (dentro de uma rota, em runtime) — nunca no module-eval do build/typecheck/
// import de teste. Falha fail-closed (throw claro) se a secret estiver
// realmente ausente quando alguém tentar usar o client de verdade; nenhum
// fallback silencioso permite checkout sem secret configurada.
let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!_stripe) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY não configurada.");
    }
    _stripe = new Stripe(apiKey, {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeClient(), prop, receiver);
  },
});

// Planos com Stripe Price IDs (configurar no Stripe Dashboard)
export const PLANS = {
  starter: {
    name: "Starter",
    price_monthly: 1900, // $19.00
    price_monthly_brl: 9700, // R$ 97,00 (currency_options do MESMO price)
    credits: 1000,
    stripe_price_id: process.env.STRIPE_STARTER_PRICE_ID || "",
  },
  pro: {
    name: "Pro",
    price_monthly: 4900, // $49.00
    price_monthly_brl: 24700, // R$ 247,00
    credits: 3000,
    stripe_price_id: process.env.STRIPE_PRO_PRICE_ID || "",
  },
  agency: {
    name: "Agency",
    price_monthly: 14900, // $149.00
    price_monthly_brl: 74700, // R$ 747,00
    credits: 10000,
    stripe_price_id: process.env.STRIPE_AGENCY_PRICE_ID || "",
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// Top-up packs
export const TOPUP_PACKS = [
  { id: "pack_100", credits: 200, price: 799, price_brl: 3990, stripe_price_id: process.env.STRIPE_TOPUP_100_PRICE_ID || "" },
  { id: "pack_250", credits: 500, price: 1799, price_brl: 8990, stripe_price_id: process.env.STRIPE_TOPUP_250_PRICE_ID || "" },
  { id: "pack_500", credits: 1000, price: 2999, price_brl: 14990, stripe_price_id: process.env.STRIPE_TOPUP_500_PRICE_ID || "" },
  { id: "pack_1000", credits: 2000, price: 4999, price_brl: 24990, stripe_price_id: process.env.STRIPE_TOPUP_1000_PRICE_ID || "" },
  { id: "pack_2000", credits: 4000, price: 8999, price_brl: 44990, stripe_price_id: process.env.STRIPE_TOPUP_2000_PRICE_ID || "" },
];

// ── Moeda por país ──────────────────────────────────────────────────────────
// Visitante do Brasil vê e paga em BRL; o resto em USD. Os valores BRL ficam
// nos currency_options dos MESMOS prices do Stripe (ids não mudam). Enquanto
// STRIPE_BRL_ENABLED != "true" tudo continua em USD — o flag só deve ser
// ligado depois que os 8 prices tiverem a opção BRL no Stripe, senão a
// sessão em BRL falha.
export type BillingCurrency = "usd" | "brl";

export function brlEnabled(): boolean {
  return process.env.STRIPE_BRL_ENABLED === "true";
}

/** País (ISO-2, ex. cabeçalho x-vercel-ip-country) → moeda de cobrança. */
export function currencyForCountry(country: string | null | undefined): BillingCurrency {
  return brlEnabled() && (country || "").toUpperCase() === "BR" ? "brl" : "usd";
}

/**
 * Valor esperado (centavos) de um pack na moeda; null = moeda não aceita.
 * Não depende do flag: um Pix em BRL criado com o flag ligado continua
 * valendo se o flag for desligado antes do pagamento cair.
 */
export function packAmount(pack: (typeof TOPUP_PACKS)[number], currency: string | null | undefined): number | null {
  const c = (currency || "").toLowerCase();
  if (c === "usd") return pack.price;
  if (c === "brl") return pack.price_brl;
  return null;
}

/** Validade do QR Code Pix da recarga (segundos). */
export const PIX_EXPIRES_AFTER_SECONDS = 30 * 60;
