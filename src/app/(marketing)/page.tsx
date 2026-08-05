import Link from "next/link";
import {
  Zap,
  Image,
  Video,
  Music,
  Sparkles,
  ArrowRight,
  Check,
  Layers,
  Users,
  Workflow,
  FolderOpen,
  Sprout,
} from "lucide-react";

const HERO_STATS = [
  { value: "30+", label: "Modelos de IA" },
  { value: "3", label: "Modalidades" },
  { value: "68%", label: "Mais barato" },
];

const MODALITIES = [
  {
    icon: Image,
    title: "Imagens",
    desc: "Flux, GPT Image 2, Ideogram, DALL-E, Seedream e mais.",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: Video,
    title: "Vídeos",
    desc: "Kling, Seedance, Veo 3, Sora 2, Hailuo, Pixverse.",
    color: "from-blue-500 to-cyan-600",
  },
  {
    icon: Music,
    title: "Áudio & Música",
    desc: "Suno, Ace-Step, ElevenLabs, Seed Audio TTS.",
    color: "from-emerald-500 to-teal-600",
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Studio",
    desc: "Interface unificada para gerar imagens, vídeos e áudios. Galeria masonry, seletor de modelos e controles avançados.",
  },
  {
    icon: Workflow,
    title: "Flows",
    desc: "Automatize criações encadeando prompts, modelos e referências em pipelines inteligentes.",
  },
  {
    icon: Users,
    title: "Influencer Studio",
    desc: "Crie vídeos UGC com personas consistentes para TikTok, Reels e Shorts.",
  },
  {
    icon: Sprout,
    title: "Seeds",
    desc: "Salve personagens e referências visuais para reutilizar em todas as gerações.",
  },
  {
    icon: FolderOpen,
    title: "Assets",
    desc: "Biblioteca centralizada de toda mídia gerada. Busca, filtros e download rápido.",
  },
  {
    icon: Sparkles,
    title: "Wise (IA)",
    desc: "Assistente que melhora seus prompts e recomenda o modelo ideal para cada caso.",
  },
];

const MODELS_SHOWCASE = [
  { name: "Flux Schnell", type: "Imagem", credits: "2 cr", tier: "Free" },
  { name: "GPT Image 2", type: "Imagem", credits: "2 cr", tier: "Starter" },
  { name: "Kling Standard 4s", type: "Vídeo", credits: "14 cr", tier: "Starter" },
  { name: "Seedance 2.0 Fast", type: "Vídeo", credits: "30 cr", tier: "Starter" },
  { name: "Veo 3.1 Lite", type: "Vídeo", credits: "16 cr", tier: "Pro" },
  { name: "Sora 2 Pro", type: "Vídeo", credits: "70 cr", tier: "Agency" },
  { name: "Ace-Step 30s", type: "Música", credits: "2 cr", tier: "Free" },
  { name: "ElevenLabs v3", type: "TTS", credits: "8 cr", tier: "Pro" },
];

export default function LandingPage() {
  return (
    <>
      {/* ═══ HERO ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0A0A0A]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.2),transparent_70%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="premium-hero-blob absolute left-1/2 top-[-180px] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#7C3AED]/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-24 text-center">
          <div className="premium-badge-shimmer mb-8 inline-flex items-center gap-2 rounded-full border border-[#2A2A2A] bg-[#111111] px-4 py-1.5 text-sm font-medium text-[#F5F5F5]">
            ✦ 20+ modelos de IA
          </div>

          <h1 className="mb-6 text-5xl font-black leading-[1.05] tracking-tight text-[#F5F5F5] md:text-6xl">
            Transforme suas ideias em{" "}
            <span className="bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] bg-clip-text text-transparent">
              mídia premium
            </span>{" "}
            com IA multimodal
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-[#888888]">
            Imagens, vídeos e áudio em um único fluxo: geração rápida, controle avançado e consistência visual para creators e times de performance.
          </p>

          <div className="mb-14 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] px-6 py-3 text-base font-semibold text-white shadow-[0_8px_30px_rgba(124,58,237,0.35)] transition duration-200 hover:scale-[1.02]"
            >
              <Zap className="h-5 w-5" />
              Começar grátis
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#111111] px-6 py-3 text-base font-medium text-[#F5F5F5] transition hover:bg-[#1A1A1A]"
            >
              Ver planos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-12">
            {HERO_STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-foreground">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ MODALIDADES ════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Três modalidades, uma plataforma
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
            Gere imagens, vídeos e áudios de alta qualidade com os modelos mais
            avançados do mercado.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {MODALITIES.map((m) => (
              <div
                key={m.title}
                className="rounded-2xl bg-card border border-border p-8 hover:border-primary/40 transition group"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-6 group-hover:scale-110 transition`}
                >
                  <m.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{m.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══════════════════════════════════════════════ */}
      <section id="features" className="py-24 px-6 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Tudo que você precisa
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
            Do studio de geração livre a automações inteligentes — ferramentas
            poderosas para criadores profissionais.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-background border border-border p-6 hover:border-primary/30 transition"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ MODELOS ════════════════════════════════════════════════ */}
      <section id="models" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Os melhores modelos do mundo
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
            Acesse Kling, Veo 3, Sora 2, Flux, ElevenLabs e mais — tudo com
            créditos transparentes.
          </p>

          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-4 bg-primary/10 text-sm font-semibold px-6 py-3 text-foreground">
              <span>Modelo</span>
              <span>Tipo</span>
              <span>Créditos</span>
              <span>Disponível em</span>
            </div>
            {MODELS_SHOWCASE.map((m, i) => (
              <div
                key={m.name}
                className={`grid grid-cols-4 text-sm px-6 py-3 border-t border-border ${
                  i % 2 === 0 ? "bg-background" : "bg-card"
                }`}
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">{m.type}</span>
                <span className="text-primary font-semibold">⚡ {m.credits}</span>
                <span>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                    {m.tier}+
                  </span>
                </span>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            E mais de 20 outros modelos disponíveis na plataforma.
          </p>
        </div>
      </section>

      {/* ═══ COMPARAÇÃO ═════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-card/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Por que Fluxyra?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-14">
            Comparado ao principal concorrente, o Fluxyra oferece mais por menos.
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Concorrente */}
            <div className="rounded-2xl border border-border p-8 bg-background">
              <p className="text-sm text-muted-foreground mb-2">Concorrente</p>
              <p className="text-3xl font-bold mb-1">$24<span className="text-base font-normal text-muted-foreground">/mês</span></p>
              <p className="text-sm text-muted-foreground mb-6">275 créditos</p>
              <ul className="space-y-2 text-sm text-left">
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-red-400">✗</span> 36 vídeos Kling/mês
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-red-400">✗</span> $0.67 por vídeo
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-red-400">✗</span> 15 vídeos Seedance/mês
                </li>
              </ul>
            </div>

            {/* Fluxyra */}
            <div className="rounded-2xl border-2 border-primary p-8 bg-primary/5 shadow-lg shadow-primary/10">
              <p className="text-sm text-primary font-semibold mb-2">Fluxyra ⚡</p>
              <p className="text-3xl font-bold mb-1">$19<span className="text-base font-normal text-muted-foreground">/mês</span></p>
              <p className="text-sm text-muted-foreground mb-6">500 créditos</p>
              <ul className="space-y-2 text-sm text-left">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /> 71 vídeos Kling/mês (+97%)
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /> $0.27 por vídeo (−59%)
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /> 33 vídeos Seedance/mês (+120%)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ══════════════════════════════════════════════ */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para criar com IA?
          </h2>
          <p className="text-muted-foreground mb-8">
            Comece grátis com 10 créditos. Sem cartão de crédito.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition"
          >
            <Zap className="w-5 h-5" />
            Criar conta grátis
          </Link>
        </div>
      </section>
    </>
  );
}
