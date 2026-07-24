import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
});

// Planos com Stripe Price IDs (configurar no Stripe Dashboard)
export const PLANS = {
  starter: {
    name: "Starter",
    price_monthly: 1900, // $19.00
    credits: 500,
    stripe_price_id: process.env.STRIPE_STARTER_PRICE_ID || "",
  },
  pro: {
    name: "Pro",
    price_monthly: 4900, // $49.00
    credits: 1500,
    stripe_price_id: process.env.STRIPE_PRO_PRICE_ID || "",
  },
  agency: {
    name: "Agency",
    price_monthly: 14900, // $149.00
    credits: 5000,
    stripe_price_id: process.env.STRIPE_AGENCY_PRICE_ID || "",
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// Top-up packs
export const TOPUP_PACKS = [
  { id: "pack_100", credits: 100, price: 799, stripe_price_id: process.env.STRIPE_TOPUP_100_PRICE_ID || "" },
  { id: "pack_250", credits: 250, price: 1799, stripe_price_id: process.env.STRIPE_TOPUP_250_PRICE_ID || "" },
  { id: "pack_500", credits: 500, price: 2999, stripe_price_id: process.env.STRIPE_TOPUP_500_PRICE_ID || "" },
  { id: "pack_1000", credits: 1000, price: 4999, stripe_price_id: process.env.STRIPE_TOPUP_1000_PRICE_ID || "" },
  { id: "pack_2000", credits: 2000, price: 8999, stripe_price_id: process.env.STRIPE_TOPUP_2000_PRICE_ID || "" },
];
