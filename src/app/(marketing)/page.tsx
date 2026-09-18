"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Wand2, ChevronDown } from "lucide-react";
import {
  EASE,
  Reveal,
  MaskedTextReveal,
  EditorialMedia,
  GrowLine,
  Stagger,
  StaggerItem,
  CountUp,
  Marquee,
  MarqueeRow,
} from "@/components/marketing/motion";
import { WorkflowScrollStory } from "@/components/marketing/workflow-story";

// ─── Real, already-supported models (per product catalog) ──────────────────
const LEADING_MODELS = ["Nano Banana", "Kling", "Seedance", "GPT Image", "Veo", "ElevenLabs"];

// ─── Real, verified trust figures only (live count confirmed against the
// production ai_models catalog: exactly 30 active rows). ────────────────
const HERO_STATS = [
  { value: 30, label: "Modelos de IA" },
  { value: 3, label: "Modalidades" },
];

// ─── Ecosystem: only real assets get a photo (UGC, Influencer). Studio,
// Flows and Wise are textual-only — no fabricated screenshots (task §1/§7). ─
const ECOSYSTEM_UGC = { title: "UGC", desc: "Roteiro, avatar falante e B-roll — produção de UGC que converte.", src: "/marketing/gallery-01.webp", alt: "Ritual de skincare, exemplo de conteúdo UGC" };
const ECOSYSTEM_INFLUENCER = { title: "Influencer", desc: "Personas consistentes para criar conteúdo em escala.", src: "/marketing/gallery-03.webp", alt: "Editorial de moda, exemplo de conteúdo de influencer" };

// Mapeamento por conteúdo real + crop dirigido (task §9). 2 cards maiores + 4 menores.
const USE_CASES = [
  { title: "Fotos de produto", src: "/marketing/gallery-02.webp", pos: "50% 52%", large: true },
  { title: "Visuais cinematográficos", src: "/marketing/hero-main.webp", pos: "55% 50%", large: true },
  { title: "Conteúdo UGC", src: "/marketing/gallery-01.webp", pos: "50% 32%", large: false },
  { title: "Campanhas de marca", src: "/marketing/gallery-03.webp", pos: "50% 35%", large: false },
  { title: "Conteúdo para redes sociais", src: "/marketing/gallery-04.webp", pos: "50% 38%", large: false },
  { title: "Interiores e design", src: "/marketing/image.webp", pos: "50% 55%", large: false },
];

// Todos os 7 assets reais disponíveis — distribuídos em 2 faixas, larguras
// variadas, sem repetição dentro de cada faixa (task §10).
const GALLERY_ROW_1 = [
  { src: "/marketing/hero-main.webp", alt: "Criação Fluxyra 1", width: 280 },
  { src: "/marketing/image.webp", alt: "Criação Fluxyra 2", width: 240 },
  { src: "/marketing/ugc.webp", alt: "Criação Fluxyra 3", width: 320 },
  { src: "/marketing/gallery-01.webp", alt: "Criação Fluxyra 4", width: 220 },
];
const GALLERY_ROW_2 = [
  { src: "/marketing/gallery-02.webp", alt: "Criação Fluxyra 5", width: 280 },
  { src: "/marketing/gallery-03.webp", alt: "Criação Fluxyra 6", width: 240 },
  { src: "/marketing/gallery-04.webp", alt: "Criação Fluxyra 7", width: 320 },
];

// ─── Real pricing data (mirrors src/lib/stripe/client.ts PLANS) ─────────────
const PRICING_TEASER = [
  { name: "Teste grátis", price: "R$0", period: "", features: ["1 geração de imagem grátis (Nano Banana)", "Sem cartão de crédito"], cta: "Testar grátis", href: "/signup", highlight: false },
  { name: "Starter", price: "$19", period: "/mês", features: ["1.000 créditos mensais", "Kling, Seedance, GPT Image 2"], cta: "Assinar Starter", href: "/signup", highlight: true, badge: "Popular" },
  { name: "Pro", price: "$49", period: "/mês", features: ["3.000 créditos mensais", "Veo 3.1, Hailuo, ElevenLabs"], cta: "Assinar Pro", href: "/signup", highlight: false },
  { name: "Agency", price: "$149", period: "/mês", features: ["10.000 créditos mensais", "Todos os modelos premium"], cta: "Assinar Agency", href: "/signup", highlight: false },
];

const FAQS = [
  { q: "Preciso de cartão de crédito para testar?", a: "Não. Você cria a conta e recebe 1 geração de imagem grátis (modelo Nano Banana) sem precisar cadastrar um cartão." },
  { q: "Os créditos servem para imagem, vídeo e áudio?", a: "Sim. Fluxyra usa um único pool de créditos por conta, válido para qualquer modalidade — imagem, vídeo ou áudio." },
  { q: "Os créditos dos planos pagos expiram?", a: "Nos planos Pro e Agency, os créditos acumulam e não expiram. Você também pode comprar pacotes avulsos de recarga a qualquer momento." },
  { q: "Posso cancelar ou trocar de plano quando quiser?", a: "Sim. Gerencie sua assinatura, troque de plano ou cancele diretamente pelo portal de cobrança, sem precisar falar com suporte." },
  { q: "Quais modelos de IA estão disponíveis?", a: "Modelos líderes de mercado como Nano Banana, Kling, Seedance, GPT Image, Veo e ElevenLabs, entre outros — todos acessíveis no mesmo workspace." },
];

const H2 = "font-bold tracking-tight text-foreground [font-size:clamp(2rem,4.5vw,3.25rem)]";

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="text-base font-semibold text-foreground">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Hero media: mount reveal (scale 1.08→1, y 40→0) plus a bespoke scroll
 * depth pairing with the copy block — image drifts up to -45px while the
 * copy drifts +15px and fades slightly, over the hero's own scroll-out
 * range (task §3). Kept out of the shared EditorialMedia since this dual,
 * hero-specific pairing isn't reused anywhere else. */
function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, -45]);
  const textY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 15]);
  const textOpacity = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1, 0.85]);

  return (
    <section ref={ref} className="px-6 pb-16 pt-12 sm:pt-16">
      <div className="mx-auto max-w-[1240px]">
        <motion.div style={{ y: textY, opacity: textOpacity }} className="max-w-[880px]">
          <h1 className="font-bold text-foreground [font-size:clamp(3.5rem,6.5vw,5.5rem)] [line-height:0.95] tracking-[-0.02em]">
            <MaskedTextReveal mode="mount" lines={["Uma plataforma criativa", "para transformar qualquer", "ideia em conteúdo."]} />
          </h1>

          <Reveal mode="mount" delay={0.55}>
            <p className="mt-6 max-w-[600px] text-lg leading-[1.55] text-muted-foreground">
              Crie imagens, vídeos, áudio, UGC e campanhas com os melhores modelos de IA em um só lugar.
            </p>
          </Reveal>

          <Reveal mode="mount" delay={0.65}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3.5 text-base font-semibold text-background shadow-[0_12px_32px_-12px_rgba(21,19,25,0.35)] transition duration-200 hover:-translate-y-0.5 hover:bg-foreground/90 hover:shadow-[0_16px_36px_-12px_rgba(21,19,25,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Começar grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 text-base font-medium text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Ver recursos
              </a>
            </div>
          </Reveal>

          <Reveal mode="mount" delay={0.78}>
            <div className="mt-9 flex flex-wrap items-center gap-x-10 gap-y-4">
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-foreground">
                    <CountUp to={s.value} />
                  </p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </motion.div>

        {/* Mídia começa logo abaixo do texto — sem gap enorme */}
        <motion.div
          className="relative mt-8 aspect-video w-full overflow-hidden rounded-[28px] border border-border shadow-[0_24px_64px_-32px_rgba(21,19,25,0.28)] sm:mt-10"
          initial={{ opacity: 0, scale: 1.08, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE }}
          style={{ y: imageY }}
        >
          <Image
            src="/marketing/hero-main.webp"
            alt="Studio Fluxyra em uso"
            fill
            priority
            sizes="(min-width: 1240px) 1240px, 100vw"
            className="object-cover object-[55%_50%] md:object-[48%_45%] lg:object-[50%_45%]"
          />
        </motion.div>
      </div>
    </section>
  );
}

export default function MarketingHomePage() {
  return (
    <>
      <Hero />

      {/* ═══ STUDIO / MODELS — leve, editorial, sem retângulo vazio ═════ */}
      <section className="border-y border-border bg-secondary/60 px-6 py-20">
        <div className="mx-auto max-w-[900px] text-center">
          <Reveal>
            <h2 className={H2}>Os melhores modelos. Um único workspace.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Acesse os modelos líderes de IA generativa direto do Studio Fluxyra, sem trocar de ferramenta.
            </p>
          </Reveal>
          <Reveal delay={0.16} className="mt-10">
            <Marquee items={LEADING_MODELS} />
          </Reveal>
        </div>
      </section>

      {/* ═══ WORKFLOW — scroll storytelling ═════════════════════════════ */}
      <section id="workflow" className="scroll-mt-24 px-6 pb-8 pt-20">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <h2 className={H2}>Tudo o que sua próxima ideia precisa.</h2>
          </Reveal>
        </div>
        <div className="mt-6 md:mt-0">
          <WorkflowScrollStory />
        </div>
      </section>

      {/* ═══ ECOSYSTEM — assimétrico, só conteúdo real ═══════════════════ */}
      <section id="ecosystem" className="scroll-mt-24 bg-secondary/60 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Um ecossistema, todas as suas ferramentas.</h2>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-12">
            {/* UGC — imagem grande, dominante, 2 linhas */}
            <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm md:col-span-7 md:row-span-2">
              <EditorialMedia src={ECOSYSTEM_UGC.src} alt={ECOSYSTEM_UGC.alt} aspect="aspect-[4/5] md:aspect-[16/13]" objectPosition="50% 30%" />
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{ECOSYSTEM_UGC.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ECOSYSTEM_UGC.desc}</p>
              </div>
            </div>

            {/* Studio — textual, com CTA real */}
            <Reveal className="flex flex-col justify-between rounded-3xl border border-border bg-surface p-7 shadow-sm md:col-span-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Studio</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Interface unificada para gerar imagem, vídeo e áudio com controle total.
                </p>
              </div>
              <Link
                href="/studio"
                className="mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Abrir Studio
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Reveal>

            {/* Wise — bloco tipográfico escuro menor */}
            <Reveal delay={0.06} className="flex flex-col justify-center rounded-3xl bg-foreground p-7 text-background md:col-span-5">
              <Wand2 className="h-6 w-6 text-background/70" />
              <h3 className="mt-4 text-lg font-semibold">Wise</h3>
              <p className="mt-2 text-sm leading-relaxed text-background/70">
                Assistente de IA que aprimora prompts e recomenda o modelo ideal para cada geração.
              </p>
            </Reveal>

            {/* Influencer — imagem, banner largo */}
            <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm md:col-span-7">
              <EditorialMedia src={ECOSYSTEM_INFLUENCER.src} alt={ECOSYSTEM_INFLUENCER.alt} aspect="aspect-[16/9]" objectPosition="50% 25%" />
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{ECOSYSTEM_INFLUENCER.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ECOSYSTEM_INFLUENCER.desc}</p>
              </div>
            </div>

            {/* Flows — textual/diagramático, sem fake screenshot */}
            <Reveal delay={0.06} className="rounded-3xl border border-border bg-surface p-7 shadow-sm md:col-span-5">
              <h3 className="text-lg font-semibold text-foreground">Flows</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Automatize criações encadeando prompts, modelos e referências.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="rounded-full border border-border px-3 py-1">Prompt</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                <span className="rounded-full border border-border px-3 py-1">Modelo</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                <span className="rounded-full border border-border px-3 py-1">Mídia</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ DARK EDITORIAL SECTION — a grande virada visual ═════════════ */}
      <section id="flows" className="scroll-mt-24 bg-foreground px-6 py-24 text-background md:min-h-[90vh]">
        <div className="mx-auto flex h-full max-w-[1200px] flex-col justify-center gap-14 md:flex-row md:items-center md:gap-16">
          <div className="md:w-[46%]">
            <h2 className="font-bold tracking-tight text-background [font-size:clamp(2.25rem,4.5vw,3.5rem)] [line-height:1.05]">
              <MaskedTextReveal lines={["Conecte ideias,", "modelos e mídia", "em um único fluxo."]} />
            </h2>
            <Reveal delay={0.2}>
              <p className="mt-6 max-w-md text-lg text-background/70">
                Monte pipelines visuais que conectam prompts, modelos e referências — sem repetir trabalho manual a cada geração.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <Link
                href="/flows"
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-background/25 bg-background/5 px-5 py-3 text-sm font-medium text-background transition duration-200 hover:-translate-y-0.5 hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
              >
                Ver Flows
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
          </div>

          <div className="relative md:w-[54%]">
            <div className="grid grid-cols-3 gap-4">
              {["Ideia", "Modelo", "Mídia"].map((label, i) => (
                <Reveal key={label} delay={0.15 + i * 0.15} y={16}>
                  <div className="rounded-2xl border border-background/15 bg-background/5 px-4 py-8 text-center">
                    <span className="text-xs font-semibold text-background/40">0{i + 1}</span>
                    <p className="mt-2 text-base font-semibold text-background">{label}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <GrowLine delay={0.5} className="absolute left-[16.5%] right-[16.5%] top-1/2 h-px bg-primary/40" />
          </div>
        </div>
      </section>

      {/* ═══ USE CASES — crops dirigidos, grid assimétrico ═══════════════ */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Crie para qualquer formato.</h2>
          </Reveal>

          <Stagger stagger={0.08} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((uc) => (
              <StaggerItem
                key={uc.title}
                className={`group relative aspect-[4/5] overflow-hidden rounded-2xl border border-border shadow-sm ${uc.large ? "lg:col-span-2" : "lg:col-span-1"}`}
              >
                <Image
                  src={uc.src}
                  alt={uc.title}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-[350ms] ease-out group-hover:scale-[1.035]"
                  style={{ objectPosition: uc.pos }}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent p-5 pt-16">
                  <h3 className="translate-y-1 text-base font-semibold text-white transition-transform duration-[350ms] ease-out group-hover:translate-y-0">
                    {uc.title}
                  </h3>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ═══ OUTPUT GALLERY — em movimento, duas faixas ══════════════════ */}
      <section className="bg-secondary/60 py-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <Reveal>
            <h2 className={H2}>Feito com Fluxyra.</h2>
          </Reveal>
        </div>

        <div className="mt-10 space-y-4 px-6 md:px-0">
          <MarqueeRow items={GALLERY_ROW_1} direction="left" durationSec={40} height={300} />
          <MarqueeRow items={GALLERY_ROW_2} direction="right" durationSec={46} height={300} />
        </div>
      </section>

      {/* ═══ PRICING ════════════════════════════════════════════════════ */}
      <section id="pricing" className="scroll-mt-24 px-6 py-28">
        <div className="mx-auto max-w-[1200px] text-center">
          <Reveal>
            <h2 className={H2}>Planos simples e transparentes.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Comece grátis. Faça upgrade quando precisar de mais créditos.
            </p>
          </Reveal>

          <Stagger stagger={0.1} className="mt-14 grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TEASER.map((plan) => (
              <StaggerItem
                key={plan.name}
                className={`flex flex-col rounded-3xl bg-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 ${
                  plan.highlight
                    ? "border-2 border-primary shadow-[0_16px_40px_-20px_rgba(124,58,237,0.35)] hover:shadow-[0_20px_48px_-20px_rgba(124,58,237,0.42)]"
                    : "border border-border hover:border-primary/30 hover:shadow-[0_16px_36px_-20px_rgba(21,19,25,0.2)]"
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
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-6 flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {plan.cta}
                </Link>
              </StaggerItem>
            ))}
          </Stagger>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link
              href="/pricing"
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Ver comparação completa e pacotes de recarga
            </Link>
          </p>
        </div>
      </section>

      {/* ═══ FAQ ════════════════════════════════════════════════════════ */}
      <section id="faq" className="scroll-mt-24 bg-secondary/60 px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <Reveal className="text-center">
            <h2 className={H2}>Perguntas frequentes</h2>
          </Reveal>

          <div className="mt-10 space-y-3 text-left">
            {FAQS.map((item, i) => (
              <Reveal key={item.q} delay={Math.min(i * 0.05, 0.2)}>
                <FaqItem q={item.q} a={item.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ══════════════════════════════════════════════════ */}
      <section className="px-6 py-24">
        <Reveal className="mx-auto max-w-[1200px] rounded-3xl border border-border bg-surface p-12 shadow-sm">
          <div className="max-w-lg">
            <h2 className="font-bold tracking-tight text-foreground [font-size:clamp(2rem,4.5vw,2.75rem)]">
              Pronto para criar com IA?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Teste grátis: gere 1 imagem com IA. Sem cartão de crédito.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-foreground px-8 py-4 text-base font-semibold text-background transition duration-200 hover:-translate-y-0.5 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
