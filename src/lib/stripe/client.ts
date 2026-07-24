import Stripe from "stripe";

// apiVersion omitido para usar a versão padrão fixada pela lib do Stripe instalada.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
