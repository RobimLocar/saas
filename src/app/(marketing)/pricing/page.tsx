"use client";

import Link from "next/link";
import { useState } from "react";
import { Zap, Check, ArrowRight, Loader2 } from "lucide-react";

const PLANS = [
  {
    // GROWTH-02 — NÃO é plano grátis recorrente: é um TESTE GRÁTIS de 1 imagem.
    name: "Teste grátis",
    price: { monthly: 0, yearly: 0 },
    credits: 0,
    cta: "Testar grátis",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "1 geração de imagem grátis (Nano Banana)",
      "Sem cartão de crédito",
      "Depois, recarregue créditos para continuar",
    ],
  },
  {
    name: "Starter",
    price: { monthly: 19, yearly: 15.2 },
    credits: 1000,
    cta: "Assinar Starter",
    ctaHref: "/signup",
    highlight: true,
    badge: "Popular",
    features: [
      "1.000 créditos mensais",
      "Kling, Seedance, GPT Image 2",
      "Resolução até 1080p",
    ],
  },
  {
    name: "Pro",
    price: { monthly: 49, yearly: 39.2 },
    credits: 3000,
    cta: "Assinar Pro",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "3.000 créditos mensais",
      "Veo 3.1, Hailuo e ElevenLabs",
      "Resolução até 4K",
      "Créditos acumulam e não expiram",
    ],
  },
  {
    name: "Agency",
    price: { monthly: 149, yearly: 119.2 },
    credits: 10000,
    cta: "Assinar Agency",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "10.000 créditos mensais",
      "Para equipes e produção em escala",
      "Créditos acumulam e não expiram",
      "API access (em breve)",
    ],
  },
];

// GROWTH-03 — packs REAIS (ids = TOPUP_PACKS do servidor); benefício compreensível
// em vez de "custo por crédito". Um único pack recomendado para a 1ª recarga.
const TOPUPS = [
  { id: "pack_100", credits: 200, price: 7.99, benefit: "Para experimentar mais", recommended: false },
  { id: "pack_250", credits: 500, price: 17.99, benefit: "Para continuar criando", recommended: true },
  { id: "pack_500", credits: 1000, price: 29.99, benefit: "Ótimo para vídeos", recommended: false },
  { id: "pack_1000", credits: 2000, price: 49.99, benefit: "Para volume", recommended: false },
  { id: "pack_2000", credits: 4000, price: 89.99, benefit: "Melhor custo por crédito", recommended: false },
];

export default function PricingPage() {
  // GROWTH-03 — dispara o checkout de recarga (endpoint já existente). Usuário
  // logado → Stripe; sem sessão → login e volta para a recarga.
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  async function handleTopup(packId: string) {
    if (loadingPack) return;
    setLoadingPack(packId);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topup_pack_id: packId }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        window.location.assign("/login?redirect=/pricing%23recarga");
        return;
      }
      if (res.ok && data?.url) {
        window.location.assign(data.url as string);
        return;
      }
      setLoadingPack(null);
    } catch {
      setLoadingPack(null);
    }
  }

  return (
    <div className="px-6 py-20">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto text-center mb-14">
        <span className="inline-block px-3 py-1.5 rounded-full bg-surface border border-border text-xs font-medium text-muted-foreground mb-4 shadow-sm">
          Preços simples e transparentes
        </span>
        <h1 className="font-bold tracking-tight mb-4 text-foreground [font-size:clamp(2rem,4.5vw,3rem)]">
          Escolha seu plano
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Créditos para gerar imagem, vídeo e áudio com os melhores modelos de
          IA. Faça upgrade ou downgrade quando quiser.
        </p>
      </div>

      {/* ─── Plan Cards ──────────────────────────────────── */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-[1240px] mx-auto mb-24">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-3xl p-6 flex flex-col bg-surface transition-all duration-300 hover:-translate-y-1 ${
              plan.highlight
                ? "border-2 border-primary shadow-[0_16px_40px_-20px_rgba(124,58,237,0.35)] hover:shadow-[0_20px_48px_-20px_rgba(124,58,237,0.42)]"
                : "border border-border shadow-sm hover:border-primary/30 hover:shadow-[0_16px_36px_-20px_rgba(21,19,25,0.2)]"
            }`}
          >
            {plan.badge && (
              <span className="self-start px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold mb-3">
                {plan.badge}
              </span>
            )}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {plan.name}
            </h3>
            <div className="mt-4 mb-1 flex items-end gap-1">
              <span className="text-4xl font-extrabold text-foreground">
                ${plan.price.monthly}
              </span>
              <span className="text-muted-foreground text-sm mb-1">/mês</span>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              {plan.credits > 0
                ? `${plan.credits.toLocaleString()} créditos/mês`
                : "Para experimentar"}
            </p>

            <Link
              href={plan.ctaHref}
              className={`h-11 rounded-xl flex items-center justify-center text-sm font-semibold transition mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                plan.highlight
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                  : "border border-border text-foreground hover:bg-muted"
              }`}
            >
              {plan.cta}
            </Link>

            <ul className="space-y-3 text-sm text-muted-foreground">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ─── Top-up Packs (recarga) ──────────────────────── */}
      <div id="recarga" className="max-w-3xl mx-auto mb-24 scroll-mt-24">
        <h2 className="text-2xl font-bold text-center mb-3 text-foreground">
          Recarregar créditos
        </h2>
        <p className="text-muted-foreground text-center text-sm mb-10">
          Compre créditos avulsos e continue criando — eles nunca expiram. Sem assinatura.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {TOPUPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTopup(t.id)}
              disabled={loadingPack !== null}
              className={`relative rounded-2xl border bg-surface p-4 text-center transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                t.recommended
                  ? "border-2 border-primary shadow-[0_16px_40px_-20px_rgba(124,58,237,0.35)] hover:-translate-y-1"
                  : "border-border shadow-sm hover:-translate-y-1 hover:border-primary/40"
              }`}
            >
              {t.recommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  Mais escolhido
                </span>
              )}
              <p className="text-2xl font-bold text-foreground mb-1">
                <Zap className="inline w-5 h-5 text-primary mr-1" />
                {t.credits}
              </p>
              <p className="text-sm text-muted-foreground mb-2">créditos</p>
              <p className="text-lg font-semibold text-primary">
                {loadingPack === t.id ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : (
                  `$${t.price.toFixed(2)}`
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t.benefit}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ─── CTA ─────────────────────────────────────────── */}
      <div className="text-center">
        <p className="text-muted-foreground mb-4 text-sm">
          Comece grátis. Faça upgrade quando precisar.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition duration-200 hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Criar conta grátis
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
