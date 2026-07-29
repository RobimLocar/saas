"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Check, ArrowRight } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    credits: 10,
    cta: "Começar grátis",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "10 créditos mensais",
      "Modelos básicos (Flux Schnell, LTX)",
      "Resolução até 720p",
      "3 gerações/dia",
      "Marca d'água nos vídeos",
    ],
  },
  {
    name: "Starter",
    price: { monthly: 19, yearly: 15.2 },
    credits: 500,
    cta: "Assinar Starter",
    ctaHref: "/signup",
    highlight: true,
    badge: "Popular",
    features: [
      "500 créditos mensais",
      "Kling, Seedance, GPT Image 2",
      "Resolução até 1080p",
      "50 gerações/dia",
      "Sem marca d'água",
      "~71 vídeos Kling/mês",
      "~33 vídeos Seedance/mês",
    ],
  },
  {
    name: "Pro",
    price: { monthly: 49, yearly: 39.2 },
    credits: 1500,
    cta: "Assinar Pro",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "1.500 créditos mensais",
      "Veo 3.1, Hailuo, Suno, ElevenLabs",
      "Resolução até 4K",
      "150 gerações/dia",
      "Rollover de até 100 cr/mês",
      "Flows personalizados",
      "~214 vídeos Kling/mês",
    ],
  },
  {
    name: "Agency",
    price: { monthly: 149, yearly: 119.2 },
    credits: 5000,
    cta: "Assinar Agency",
    ctaHref: "/signup",
    highlight: false,
    features: [
      "5.000 créditos mensais",
      "Veo 3, Sora 2, Kling v3 Pro",
      "Todos os modelos premium",
      "500 gerações/dia",
      "Rollover de até 500 cr/mês",
      "API access (em breve)",
      "~714 vídeos Kling/mês",
    ],
  },
];

const TOPUPS = [
  { credits: 100, price: 7.99 },
  { credits: 250, price: 17.99 },
  { credits: 500, price: 29.99 },
  { credits: 1000, price: 49.99 },
  { credits: 2000, price: 89.99 },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="px-6 py-20">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto text-center mb-12">
        <span className="inline-block px-3 py-1 rounded-full bg-muted border border-border text-xs text-muted-foreground mb-4">
          Preços simples e transparentes
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
          Escolha seu plano
        </h1>
        <p className="text-muted-foreground text-base">
          Créditos para gerar imagem, vídeo e áudio com os melhores modelos de
          IA. Faça upgrade ou downgrade quando quiser.
        </p>

        {/* Toggle */}
        <div className="inline-flex items-center gap-1 mt-8 p-1 rounded-full bg-muted border border-border">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${
              !annual
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${
              annual
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            Anual{" "}
            <span className="text-[11px] opacity-80">−20%</span>
          </button>
        </div>
      </div>

      {/* ─── Plan Cards ──────────────────────────────────── */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-[1240px] mx-auto mb-24">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl p-6 flex flex-col ${
              plan.highlight
                ? "bg-primary/5 border-2 border-primary shadow-lg shadow-primary/10"
                : "bg-card border border-border"
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
              <span className="text-4xl font-extrabold">
                ${annual ? plan.price.yearly : plan.price.monthly}
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
              className={`h-11 rounded-lg flex items-center justify-center text-sm font-medium transition mb-6 ${
                plan.highlight
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border hover:bg-muted/50"
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

      {/* ─── Top-up Packs ────────────────────────────────── */}
      <div className="max-w-3xl mx-auto mb-24">
        <h2 className="text-2xl font-bold text-center mb-3">
          Precisa de mais créditos?
        </h2>
        <p className="text-muted-foreground text-center text-sm mb-10">
          Compre créditos avulsos — eles nunca expiram.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {TOPUPS.map((t) => (
            <div
              key={t.credits}
              className="rounded-xl border border-border bg-card p-4 text-center hover:border-primary/40 transition cursor-pointer"
            >
              <p className="text-2xl font-bold text-foreground mb-1">
                <Zap className="inline w-5 h-5 text-primary mr-1" />
                {t.credits}
              </p>
              <p className="text-sm text-muted-foreground mb-2">créditos</p>
              <p className="text-lg font-semibold text-primary">
                ${t.price.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ${(t.price / t.credits).toFixed(4)}/cr
              </p>
            </div>
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
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
        >
          Criar conta grátis
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
