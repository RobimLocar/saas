"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Zap, Check, ArrowRight, Loader2 } from "lucide-react";

const PLANS = [
  {
    // GROWTH-02 — NÃO é plano grátis recorrente: é um TESTE GRÁTIS de 1 imagem.
    name: "Teste grátis",
    price: { monthly: 0, yearly: 0 },
    price_brl: 0,
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
    price_brl: 97,
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
    price_brl: 247,
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
    price_brl: 747,
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
  { id: "pack_100", credits: 200, price: 7.99, price_brl: 39.9, benefit: "Para experimentar mais", recommended: false },
  { id: "pack_250", credits: 500, price: 17.99, price_brl: 89.9, benefit: "Para continuar criando", recommended: true },
  { id: "pack_500", credits: 1000, price: 29.99, price_brl: 149.9, benefit: "Ótimo para vídeos", recommended: false },
  { id: "pack_1000", credits: 2000, price: 49.99, price_brl: 249.9, benefit: "Para volume", recommended: false },
  { id: "pack_2000", credits: 4000, price: 89.99, price_brl: 449.9, benefit: "Melhor custo por crédito", recommended: false },
];

// Moeda do visitante (BRL no Brasil, USD fora) — a mesma que o checkout usa.
type Currency = "usd" | "brl";
function formatMoney(value: number, currency: Currency, cents: boolean): string {
  return new Intl.NumberFormat(currency === "brl" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<Currency>("usd");
  const [topupError, setTopupError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/billing/currency")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && (d?.currency === "brl" || d?.currency === "usd")) setCurrency(d.currency);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // GROWTH-03 — dispara o checkout de recarga (endpoint já existente). Usuário
  // logado → Stripe; sem sessão → login e volta para a recarga.
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  async function handleTopup(packId: string) {
    if (loadingPack) return;
    setLoadingPack(packId);
    setTopupError(null);
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
      setTopupError(
        typeof data?.error === "string" ? data.error : "Não foi possível abrir o pagamento. Tente novamente."
      );
      setLoadingPack(null);
    } catch {
      setTopupError("Não foi possível abrir o pagamento. Verifique sua conexão e tente novamente.");
      setLoadingPack(null);
    }
  }

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
                {currency === "brl"
                  ? formatMoney(plan.price_brl, "brl", false)
                  : formatMoney(plan.price.monthly, "usd", false)}
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

      {/* ─── Top-up Packs (recarga) ──────────────────────── */}
      <div id="recarga" className="max-w-3xl mx-auto mb-24 scroll-mt-24">
        <h2 className="text-2xl font-bold text-center mb-3">
          Recarregar créditos
        </h2>
        <p className="text-muted-foreground text-center text-sm mb-10">
          Compre créditos avulsos e continue criando — eles nunca expiram. Sem assinatura.
          {currency === "brl" && " Pagamento via Pix: os créditos entram assim que o Pix é confirmado."}
        </p>
        {topupError && (
          <p role="alert" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            {topupError}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {TOPUPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTopup(t.id)}
              disabled={loadingPack !== null}
              className={`relative rounded-xl border bg-card p-4 text-center transition disabled:opacity-60 ${
                t.recommended
                  ? "border-2 border-primary shadow-lg shadow-primary/10"
                  : "border-border hover:border-primary/40"
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
                  currency === "brl" ? formatMoney(t.price_brl, "brl", true) : formatMoney(t.price, "usd", true)
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
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
        >
          Criar conta grátis
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
