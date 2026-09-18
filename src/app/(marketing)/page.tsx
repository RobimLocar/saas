"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Image as ImageIcon,
  Video,
  Music,
  Sparkles,
  Layers,
  Users,
  Workflow as WorkflowIcon,
  Wand2,
  ShoppingBag,
  Megaphone,
  Film,
  Share2,
  Building2,
  ChevronDown,
} from "lucide-react";

// ─── Real, already-supported models (per product catalog) ──────────────────
const LEADING_MODELS = ["Nano Banana", "Kling", "Seedance", "GPT Image", "Veo", "ElevenLabs"];

// ─── Real, already-approved trust figures (unchanged from prior landing) ───
const HERO_STATS = [
  { value: "30+", label: "Modelos de IA" },
  { value: "3", label: "Modalidades" },
  { value: "68%", label: "Mais barato" },
];

const WORKFLOW_ITEMS = [
  {
    icon: ImageIcon,
    title: "Imagem",
    desc: "Fotorrealista ou estilizada, pronta em segundos.",
    tone: "from-violet-100 to-white",
  },
  {
    icon: Video,
    title: "Vídeo",
    desc: "Vídeos cinematográficos com os modelos mais avançados.",
    tone: "from-purple-100 to-white",
  },
  {
    icon: Music,
    title: "Áudio",
    desc: "Trilhas, efeitos e narrações compostos por IA.",
    tone: "from-fuchsia-100 to-white",
  },
];

const ECOSYSTEM_ITEMS = [
  {
    icon: Layers,
    title: "Studio",
    desc: "Interface unificada para gerar imagem, vídeo e áudio com controle total.",
    span: "md:col-span-3 md:row-span-2",
  },
  {
    icon: Users,
    title: "UGC",
    desc: "Roteiro, avatar falante e B-roll — produção de UGC que converte.",
    span: "md:col-span-2",
  },
  {
    icon: Sparkles,
    title: "Influencer",
    desc: "Personas consistentes para criar conteúdo em escala.",
    span: "md:col-span-2",
  },
  {
    icon: Wand2,
    title: "Wise",
    desc: "Assistente de IA que aprimora prompts e recomenda o modelo ideal.",
    span: "md:col-span-2",
  },
  {
    icon: WorkflowIcon,
    title: "Flows",
    desc: "Automatize criações encadeando prompts, modelos e referências.",
    span: "md:col-span-3",
  },
];

const USE_CASES = [
  { icon: ShoppingBag, title: "Fotos de produto" },
  { icon: Users, title: "Conteúdo UGC" },
  { icon: Megaphone, title: "Campanhas de marca" },
  { icon: Film, title: "Visuais cinematográficos" },
  { icon: Share2, title: "Conteúdo para redes sociais" },
  { icon: Building2, title: "Interiores e design" },
];

// ─── Real pricing data (mirrors src/lib/stripe/client.ts PLANS — do not
// invent or diverge from these values; this is a presentational-only teaser
// that links to /pricing for the full comparison + top-ups). ─────────────
const PRICING_TEASER = [
  {
    name: "Teste grátis",
    price: "R$0",
    period: "",
    desc: "1 geração de imagem grátis (Nano Banana). Sem cartão.",
    cta: "Testar grátis",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/mês",
    desc: "1.000 créditos mensais · Kling, Seedance, GPT Image 2",
    cta: "Assinar Starter",
    href: "/signup",
    highlight: true,
    badge: "Popular",
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mês",
    desc: "3.000 créditos mensais · Veo 3.1, Hailuo, ElevenLabs",
    cta: "Assinar Pro",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Agency",
    price: "$149",
    period: "/mês",
    desc: "10.000 créditos mensais · Todos os modelos premium",
    cta: "Assinar Agency",
    href: "/signup",
    highlight: false,
  },
];

// ─── FAQ — grounded strictly in already-shipped, verified product behavior.
// No new commercial claims invented. ─────────────────────────────────────
const FAQS = [
  {
    q: "Preciso de cartão de crédito para testar?",
    a: "Não. Você cria a conta e recebe 1 geração de imagem grátis (modelo Nano Banana) sem precisar cadastrar um cartão.",
  },
  {
    q: "Os créditos servem para imagem, vídeo e áudio?",
    a: "Sim. Fluxyra usa um único pool de créditos por conta, válido para qualquer modalidade — imagem, vídeo ou áudio.",
  },
  {
    q: "Os créditos dos planos pagos expiram?",
    a: "Nos planos Pro e Agency, os créditos acumulam e não expiram. Você também pode comprar pacotes avulsos de recarga a qualquer momento.",
  },
  {
    q: "Posso cancelar ou trocar de plano quando quiser?",
    a: "Sim. Gerencie sua assinatura, troque de plano ou cancele diretamente pelo portal de cobrança, sem precisar falar com suporte.",
  },
  {
    q: "Quais modelos de IA estão disponíveis?",
    a: "Modelos líderes de mercado como Nano Banana, Kling, Seedance, GPT Image, Veo e ElevenLabs, entre outros — todos acessíveis no mesmo workspace.",
  },
];

/** Composição abstrata de blocos — placeholder claramente substituível para
 * visuais de produto/hero. Sem asset externo, sem screenshot falso/borrado. */
function MediaTileGrid({ className = "" }: { className?: string }) {
  const tiles = [
    "row-span-2 bg-gradient-to-br from-violet-200 via-violet-100 to-white",
    "bg-gradient-to-br from-fuchsia-100 to-white",
    "bg-gradient-to-br from-purple-200 to-white",
    "row-span-2 bg-gradient-to-br from-violet-100 via-white to-fuchsia-50",
    "bg-gradient-to-br from-violet-50 to-white",
    "bg-gradient-to-br from-purple-100 via-violet-50 to-white",
  ];
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`} aria-hidden="true">
      {tiles.map((t, i) => (
        <div key={i} className={`rounded-2xl border border-border shadow-sm ${t}`} style={{ minHeight: i % 3 === 0 ? 160 : 96 }} />
      ))}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-base font-semibold text-foreground">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>}
    </div>
  );
}

export default function MarketingHomePage() {
  return (
    <>
      {/* ═══ HERO ═══════════════════════════════════════════════════════ */}
      <section className="px-6 pb-20 pt-10 sm:pt-16">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground">
              <span className="flex -space-x-2" aria-hidden="true">
                <span className="h-5 w-5 rounded-full border-2 border-surface bg-gradient-to-br from-violet-400 to-violet-600" />
                <span className="h-5 w-5 rounded-full border-2 border-surface bg-gradient-to-br from-fuchsia-400 to-purple-500" />
                <span className="h-5 w-5 rounded-full border-2 border-surface bg-gradient-to-br from-purple-300 to-violet-500" />
              </span>
              Criadores e equipes já publicam com Fluxyra
            </div>

            <h1 className="text-[2.6rem] font-bold leading-[1.08] tracking-tight text-foreground [font-size:clamp(2.2rem,5vw,3.4rem)]">
              Uma plataforma criativa para transformar qualquer ideia em conteúdo.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Crie imagens, vídeos, áudio, UGC e campanhas com os melhores modelos de IA em um só lugar.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3.5 text-base font-semibold text-background shadow-[0_12px_32px_-12px_rgba(21,19,25,0.35)] transition hover:bg-foreground/90"
              >
                Começar grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 text-base font-medium text-foreground transition hover:bg-muted"
              >
                Ver recursos
              </a>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-4">
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <MediaTileGrid className="hidden lg:grid" />
        </div>
      </section>

      {/* ═══ LEADING MODELS ═════════════════════════════════════════════ */}
      <section className="border-y border-border bg-secondary/60 px-6 py-16">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.6rem,3.5vw,2.2rem)]">
            Os melhores modelos. Um único workspace.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Acesse os modelos líderes de IA generativa direto do Studio Fluxyra, sem trocar de ferramenta.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {LEADING_MODELS.map((m) => (
              <span
                key={m}
                className="rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium text-foreground shadow-sm"
              >
                {m}
              </span>
            ))}
          </div>

          <MediaTileGrid className="mx-auto mt-12 max-w-3xl grid-cols-4" />
        </div>
      </section>

      {/* ═══ WORKFLOW ═══════════════════════════════════════════════════ */}
      <section id="workflow" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.6rem)]">
            Tudo o que sua próxima ideia precisa.
          </h2>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {WORKFLOW_ITEMS.map((item) => (
              <div key={item.title} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
                <div className={`flex h-44 items-center justify-center bg-gradient-to-br ${item.tone}`} aria-hidden="true">
                  <item.icon className="h-12 w-12 text-primary" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ECOSYSTEM ══════════════════════════════════════════════════ */}
      <section id="ecosystem" className="scroll-mt-24 bg-secondary/60 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.6rem)]">
            Um ecossistema, todas as suas ferramentas.
          </h2>

          <div className="mt-14 grid gap-5 md:grid-cols-5">
            {ECOSYSTEM_ITEMS.map((item) => (
              <div
                key={item.title}
                className={`rounded-3xl border border-border bg-surface p-7 shadow-sm ${item.span}`}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FLOWS ══════════════════════════════════════════════════════ */}
      <section id="flows" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.6rem)]">
                Conecte ideias, modelos e mídia em um único fluxo.
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground">
                Monte pipelines visuais que conectam prompts, modelos e referências — sem repetir trabalho manual a cada geração.
              </p>
              <Link
                href="/flows"
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Ver Flows
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Placeholder de diagrama de fluxo — abstrato, sem asset externo */}
            <div className="rounded-3xl border border-border bg-surface p-8 shadow-sm" aria-hidden="true">
              <div className="flex items-center justify-between gap-3">
                {["Ideia", "Modelo", "Mídia"].map((label, i) => (
                  <div key={label} className="flex flex-1 items-center gap-3">
                    <div className="flex h-16 flex-1 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-violet-50 to-white text-sm font-medium text-foreground">
                      {label}
                    </div>
                    {i < 2 && <div className="h-px w-6 shrink-0 bg-border" />}
                  </div>
                ))}
              </div>
              <div className="mt-6 h-24 rounded-2xl border border-dashed border-border" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ MODELS STRIP ═══════════════════════════════════════════════ */}
      <section className="border-y border-border px-6 py-10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {LEADING_MODELS.map((m) => (
            <span key={m} className="text-sm font-semibold tracking-wide text-muted-foreground">
              {m}
            </span>
          ))}
        </div>
      </section>

      {/* ═══ USE CASES ══════════════════════════════════════════════════ */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.6rem)]">
            Crie para qualquer formato.
          </h2>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((uc) => (
              <div key={uc.title} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <uc.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{uc.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ════════════════════════════════════════════════════ */}
      <section id="pricing" className="scroll-mt-24 bg-secondary/60 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.6rem)]">
            Planos simples e transparentes.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Comece grátis. Faça upgrade quando precisar de mais créditos.
          </p>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TEASER.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-3xl bg-surface p-6 shadow-sm ${
                  plan.highlight ? "border-2 border-primary shadow-[0_16px_40px_-20px_rgba(124,58,237,0.35)]" : "border border-border"
                }`}
              >
                {plan.badge && (
                  <span className="mb-3 self-start rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{plan.name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                  <span className="mb-0.5 text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {plan.desc}
                </p>
                <Link
                  href={plan.href}
                  className={`mt-6 flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link href="/pricing" className="font-medium text-primary hover:underline">
              Ver comparação completa e pacotes de recarga
            </Link>
          </p>
        </div>
      </section>

      {/* ═══ FAQ ════════════════════════════════════════════════════════ */}
      <section id="faq" className="scroll-mt-24 px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.6rem)]">
            Perguntas frequentes
          </h2>

          <div className="mt-10 space-y-3">
            {FAQS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ══════════════════════════════════════════════════ */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-[1200px] rounded-3xl border border-border bg-surface p-12 text-center shadow-sm">
          <h2 className="text-3xl font-bold tracking-tight text-foreground [font-size:clamp(1.8rem,4vw,2.4rem)]">
            Pronto para criar com IA?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Teste grátis: gere 1 imagem com IA. Sem cartão de crédito.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-foreground px-8 py-4 text-base font-semibold text-background transition hover:bg-foreground/90"
          >
            Criar conta grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
