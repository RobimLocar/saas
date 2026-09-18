"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Check, Wand2, ChevronDown, ImageOff } from "lucide-react";
import { Reveal, RevealMedia, Stagger, StaggerItem, CountUp, Marquee, ParallaxHeroMedia } from "@/components/marketing/motion";

// ─── Real, already-supported models (per product catalog) ──────────────────
const LEADING_MODELS = ["Nano Banana", "Kling", "Seedance", "GPT Image", "Veo", "ElevenLabs"];

// ─── Real, verified trust figures only (live count confirmed against the
// production ai_models catalog: exactly 30 active rows — stated as an exact
// number, not "30+", so the claim stays provably accurate). Unverified
// claims (discount %, "already used by creators") removed per editorial
// pass 03. ──────────────────────────────────────────────────────────────
const HERO_STATS = [
  { value: 30, label: "Modelos de IA" },
  { value: 3, label: "Modalidades" },
];

// needsAsset: true = no real photo/screenshot exists yet for this slot.
// Rendered as an honest "aguardando asset real" panel — never a fabricated
// screenshot, never the old placeholder image (removed per editorial pass 04).
const WORKFLOW_ITEMS = {
  imagem: { title: "Imagem", desc: "Fotorrealista ou estilizada, pronta em segundos.", src: "/marketing/image.webp", needsAsset: false },
  video: { title: "Vídeo", desc: "Vídeos cinematográficos com os modelos mais avançados.", src: "", needsAsset: true },
  audio: { title: "Áudio", desc: "Trilhas, efeitos e narrações compostos por IA.", src: "", needsAsset: true },
};

const ECOSYSTEM_ITEMS = [
  { key: "studio", title: "Studio", desc: "Interface unificada para gerar imagem, vídeo e áudio com controle total.", src: "", needsAsset: true },
  { key: "ugc", title: "UGC", desc: "Roteiro, avatar falante e B-roll — produção de UGC que converte.", src: "/marketing/ugc.webp", needsAsset: false },
  { key: "flows", title: "Flows", desc: "Automatize criações encadeando prompts, modelos e referências.", src: "", needsAsset: true },
  { key: "influencer", title: "Influencer", desc: "Personas consistentes para criar conteúdo em escala.", src: "", needsAsset: true },
];

// Mapeamento por conteúdo real (não por nome de arquivo) — cada foto vai para
// a categoria que ela de fato retrata.
const USE_CASES = [
  { title: "Fotos de produto", src: "/marketing/gallery-02.webp" },
  { title: "Conteúdo UGC", src: "/marketing/gallery-01.webp" },
  { title: "Campanhas de marca", src: "/marketing/gallery-03.webp" },
  { title: "Visuais cinematográficos", src: "/marketing/hero-main.webp" },
  { title: "Conteúdo para redes sociais", src: "/marketing/gallery-04.webp" },
  { title: "Interiores e design", src: "/marketing/image.webp" },
];

// Todos os 7 assets reais disponíveis hoje — sem repetição, sem placeholder.
const GALLERY = [
  { src: "/marketing/hero-main.webp", ratio: "aspect-square" },
  { src: "/marketing/image.webp", ratio: "aspect-[4/5]" },
  { src: "/marketing/ugc.webp", ratio: "aspect-square" },
  { src: "/marketing/gallery-01.webp", ratio: "aspect-[4/5]" },
  { src: "/marketing/gallery-02.webp", ratio: "aspect-square" },
  { src: "/marketing/gallery-03.webp", ratio: "aspect-[4/5]" },
  { src: "/marketing/gallery-04.webp", ratio: "aspect-square" },
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

const H2 = "text-center font-bold tracking-tight text-foreground [font-size:clamp(2rem,4.5vw,3.25rem)]";

/** Slot sem asset real ainda — NUNCA um mockup de interface inventado.
 * Painel neutro + rótulo curto, claramente distinto de qualquer imagem.
 * `tone="dark"` for use inside the one dark editorial section (Studio
 * showcase) — same message, inverted colors, no new tokens invented. */
function NeedsAssetPanel({ label, tone = "light" }: { label: string; tone?: "light" | "dark" }) {
  if (tone === "dark") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background/5 p-4 text-center" aria-hidden="true">
        <ImageOff className="h-7 w-7 text-background/30" />
        <p className="text-xs font-medium text-background/60">{label}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center" aria-hidden="true">
      <ImageOff className="h-7 w-7 text-muted-foreground/40" />
      <p className="text-xs font-medium text-muted-foreground/70">{label}</p>
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
        className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
      <section className="px-6 pb-24 pt-14 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal mode="mount">
            <h1 className="font-bold leading-[1.05] tracking-tight text-foreground [font-size:clamp(2.4rem,7vw,4.75rem)]">
              Uma plataforma criativa para transformar qualquer ideia em conteúdo.
            </h1>
          </Reveal>

          <Reveal mode="mount" delay={0.08}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Crie imagens, vídeos, áudio, UGC e campanhas com os melhores modelos de IA em um só lugar.
            </p>
          </Reveal>

          <Reveal mode="mount" delay={0.18}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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

          <Reveal mode="mount" delay={0.26}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
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
        </div>

        {/* Mídia cinematográfica full-width — 16:9, sem gradiente/blob/ícone gigante.
            Scale-in no mount + parallax vertical muito leve durante o scroll. */}
        <ParallaxHeroMedia className="relative mx-auto mt-14 aspect-video max-w-[1200px] overflow-hidden rounded-3xl border border-border shadow-[0_24px_64px_-32px_rgba(21,19,25,0.28)]">
          <Image src="/marketing/hero-main.webp" alt="Studio Fluxyra em uso" fill priority sizes="(min-width: 1200px) 1200px, 100vw" className="object-cover" />
        </ParallaxHeroMedia>
      </section>

      {/* ═══ STUDIO SHOWCASE — única seção escura, para ritmo editorial ═══ */}
      <section className="border-y border-border bg-foreground px-6 py-24 text-background">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className="text-center font-bold tracking-tight text-background [font-size:clamp(2rem,4.5vw,3.25rem)]">
              Os melhores modelos. Um único workspace.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-4 max-w-xl text-center text-background/70">
              Acesse os modelos líderes de IA generativa direto do Studio Fluxyra, sem trocar de ferramenta.
            </p>
          </Reveal>

          <RevealMedia delay={0.1} className="relative mx-auto mt-12 aspect-[16/10] max-w-[1100px] overflow-hidden rounded-3xl border border-background/10 shadow-[0_24px_64px_-32px_rgba(0,0,0,0.5)]">
            <NeedsAssetPanel label="Screenshot real do Studio — em breve" tone="dark" />
          </RevealMedia>

          <div className="mt-10">
            <Marquee items={LEADING_MODELS} />
          </div>
        </div>
      </section>

      {/* ═══ WORKFLOW — assimétrico ════════════════════════════════════ */}
      <section id="workflow" className="scroll-mt-24 px-6 py-28">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Tudo o que sua próxima ideia precisa.</h2>
          </Reveal>

          <Stagger stagger={0.12} className="mt-14 grid gap-6 md:grid-cols-3 md:grid-rows-2">
            {/* Imagem — grande, 2/3 de largura */}
            <StaggerItem className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm transition-all duration-300 [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[0_16px_36px_-20px_rgba(21,19,25,0.2)] md:col-span-2">
              <div className="relative aspect-[16/9]">
                <Image src={WORKFLOW_ITEMS.imagem.src} alt="Exemplo de geração de imagem" fill sizes="(min-width: 768px) 66vw, 100vw" className="object-cover" />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-foreground">{WORKFLOW_ITEMS.imagem.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{WORKFLOW_ITEMS.imagem.desc}</p>
              </div>
            </StaggerItem>

            {/* Vídeo — vertical, coluna estreita, ocupa as duas linhas */}
            <StaggerItem className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm transition-all duration-300 [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[0_16px_36px_-20px_rgba(21,19,25,0.2)] md:col-start-3 md:row-span-2">
              <div className="relative aspect-[9/16] md:h-full">
                <NeedsAssetPanel label="Exemplo real de vídeo — em breve" />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-foreground">{WORKFLOW_ITEMS.video.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{WORKFLOW_ITEMS.video.desc}</p>
              </div>
            </StaggerItem>

            {/* Áudio — bloco horizontal, mais baixo */}
            <StaggerItem className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm transition-all duration-300 [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[0_16px_36px_-20px_rgba(21,19,25,0.2)] md:col-span-2 md:row-start-2">
              <div className="flex flex-col sm:flex-row sm:items-center">
                <div className="relative h-32 w-full sm:h-full sm:w-56 sm:shrink-0">
                  <NeedsAssetPanel label="Exemplo real de áudio — em breve" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-foreground">{WORKFLOW_ITEMS.audio.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{WORKFLOW_ITEMS.audio.desc}</p>
                </div>
              </div>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* ═══ ECOSYSTEM ══════════════════════════════════════════════════ */}
      <section id="ecosystem" className="scroll-mt-24 bg-secondary/60 px-6 py-28">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Um ecossistema, todas as suas ferramentas.</h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-12">
            {/* Studio — dominante, imagem grande */}
            <RevealMedia className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm md:col-span-7">
              <div className="relative aspect-[16/10]">
                <NeedsAssetPanel label="Screenshot real do Studio — em breve" />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{ECOSYSTEM_ITEMS[0].title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ECOSYSTEM_ITEMS[0].desc}</p>
              </div>
            </RevealMedia>

            {/* UGC */}
            <RevealMedia delay={0.08} className="group overflow-hidden rounded-3xl border border-border bg-surface shadow-sm md:col-span-5">
              <div className="relative aspect-[4/3]">
                <Image src={ECOSYSTEM_ITEMS[1].src} alt={ECOSYSTEM_ITEMS[1].title} fill sizes="(min-width: 768px) 42vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{ECOSYSTEM_ITEMS[1].title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ECOSYSTEM_ITEMS[1].desc}</p>
              </div>
            </RevealMedia>

            {/* Flows — banner estreito */}
            <RevealMedia className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm md:col-span-5">
              <div className="relative aspect-[4/3]">
                <NeedsAssetPanel label="Screenshot real do Flows — em breve" />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{ECOSYSTEM_ITEMS[2].title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ECOSYSTEM_ITEMS[2].desc}</p>
              </div>
            </RevealMedia>

            {/* Influencer — dominante */}
            <RevealMedia delay={0.08} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm md:col-span-7">
              <div className="relative aspect-[16/9]">
                <NeedsAssetPanel label="Output real do Influencer Studio — em breve" />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{ECOSYSTEM_ITEMS[3].title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ECOSYSTEM_ITEMS[3].desc}</p>
              </div>
            </RevealMedia>

            {/* Wise — textual, fecha a faixa */}
            <Reveal className="flex items-center gap-5 rounded-3xl border border-border bg-surface p-7 shadow-sm md:col-span-12">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Wise</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Assistente de IA que aprimora prompts e recomenda o modelo ideal para cada geração.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ FLOWS ══════════════════════════════════════════════════════ */}
      <section id="flows" className="scroll-mt-24 px-6 py-28">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <div>
                <h2 className="font-bold tracking-tight text-foreground [font-size:clamp(2rem,4.5vw,3.25rem)]">
                  Conecte ideias, modelos e mídia em um único fluxo.
                </h2>
                <p className="mt-5 max-w-md text-lg text-muted-foreground">
                  Monte pipelines visuais que conectam prompts, modelos e referências — sem repetir trabalho manual a cada geração.
                </p>
                <Link
                  href="/flows"
                  className="mt-8 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium text-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Ver Flows
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>

            {/* Screenshot revela ~130ms depois do texto */}
            <RevealMedia delay={0.13} className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border shadow-sm">
              <NeedsAssetPanel label="Screenshot real do editor de Flows — em breve" />
            </RevealMedia>
          </div>
        </div>
      </section>

      {/* ═══ USE CASES — imagem primeiro ════════════════════════════════ */}
      <section className="bg-secondary/60 px-6 py-28">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Crie para qualquer formato.</h2>
          </Reveal>

          <Stagger stagger={0.1} className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((uc) => (
              <StaggerItem key={uc.title} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-border shadow-sm">
                <Image src={uc.src} alt={uc.title} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent p-5 pt-16">
                  <h3 className="text-base font-semibold text-white">{uc.title}</h3>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ═══ OUTPUT GALLERY ═════════════════════════════════════════════ */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Feito com Fluxyra.</h2>
          </Reveal>

          <Stagger
            stagger={0.08}
            className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6"
          >
            {GALLERY.map((g, i) => (
              <StaggerItem
                key={g.src}
                className={`group relative ${g.ratio} w-40 shrink-0 snap-center overflow-hidden rounded-2xl border border-border shadow-sm sm:w-auto`}
              >
                <Image
                  src={g.src}
                  alt={`Criação Fluxyra ${i + 1}`}
                  fill
                  sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 160px"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ═══ PRICING ════════════════════════════════════════════════════ */}
      <section id="pricing" className="scroll-mt-24 bg-secondary/60 px-6 py-28">
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <h2 className={H2}>Planos simples e transparentes.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
              Comece grátis. Faça upgrade quando precisar de mais créditos.
            </p>
          </Reveal>

          <Stagger stagger={0.1} className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
            >
              Ver comparação completa e pacotes de recarga
            </Link>
          </p>
        </div>
      </section>

      {/* ═══ FAQ ════════════════════════════════════════════════════════ */}
      <section id="faq" className="scroll-mt-24 px-6 py-28">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className={H2}>Perguntas frequentes</h2>
          </Reveal>

          <div className="mt-10 space-y-3">
            {FAQS.map((item, i) => (
              <Reveal key={item.q} delay={Math.min(i * 0.05, 0.2)}>
                <FaqItem q={item.q} a={item.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ══════════════════════════════════════════════════ */}
      <section className="px-6 pb-28">
        <Reveal className="mx-auto max-w-[1200px] rounded-3xl border border-border bg-surface p-12 text-center shadow-sm">
          <h2 className="font-bold tracking-tight text-foreground [font-size:clamp(2rem,4.5vw,2.75rem)]">
            Pronto para criar com IA?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
            Teste grátis: gere 1 imagem com IA. Sem cartão de crédito.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-foreground px-8 py-4 text-base font-semibold text-background transition duration-200 hover:-translate-y-0.5 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Criar conta grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
