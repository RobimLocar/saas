"use client";

// FLUXYRA-LANDING-DIRECTED-MOTION-PASS-06 §6 — Workflow scroll storytelling.
// Desktop: a tall (220vh) container with two CSS position:sticky columns
// (text left ~36%, media right ~58%); which of the 3 steps is "active" is
// derived from scroll progress through that container and crossfaded in.
// No scroll-jacking — pure CSS sticky + a derived index, so native scroll
// behavior, keyboard/reader navigation, and reduced-motion all keep working.
// Mobile: plain stacked blocks, no sticky, no scroll-linked JS.

import { useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { EASE } from "@/components/marketing/motion";

const STEPS = [
  {
    key: "imagem",
    title: "Imagem",
    desc: "Crie visuais, campanhas e produtos com o melhor da IA generativa.",
    src: "/marketing/image.webp",
    alt: "Exemplo de geração de imagem",
  },
  {
    key: "video",
    title: "Vídeo",
    desc: "Transforme ideias em cenas cinematográficas em minutos.",
    src: "/marketing/hero-main.webp",
    alt: "Exemplo de geração de vídeo",
  },
  {
    key: "audio",
    title: "Áudio",
    desc: "Complete a experiência com voz, música e efeitos sonoros.",
    src: "/marketing/ugc.webp",
    alt: "Exemplo de geração de áudio",
  },
] as const;

export function WorkflowScrollStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const idx = Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)));
    setActive((prev) => (prev !== idx ? idx : prev));
  });

  const step = STEPS[active];

  return (
    <>
      {/* Desktop/tablet — sticky dual-column story */}
      <div ref={containerRef} className="relative hidden md:block md:h-[220vh]">
        <div className="sticky top-0 mx-auto flex h-screen max-w-[1240px] items-center gap-[6%] px-6">
          <div className="w-[36%]">
            <div className="mb-8 flex items-center gap-4 text-sm font-semibold tabular-nums">
              {STEPS.map((s, i) => (
                <span key={s.key} className={i === active ? "text-primary" : "text-muted-foreground/50"}>
                  0{i + 1}
                </span>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -32 }}
                transition={{ duration: 0.55, ease: EASE }}
              >
                <h3 className="text-3xl font-bold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-4 max-w-sm text-lg text-muted-foreground">{step.desc}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="relative aspect-[4/5] w-[58%] overflow-hidden rounded-[28px] border border-border shadow-[0_24px_64px_-32px_rgba(21,19,25,0.24)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.key}
                className="absolute inset-0"
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -32 }}
                transition={{ duration: 0.55, ease: EASE }}
              >
                <Image src={step.src} alt={step.alt} fill sizes="58vw" className="object-cover" />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile — plain stacked blocks, no sticky/scroll-linked JS */}
      <div className="flex flex-col gap-6 md:hidden">
        {STEPS.map((s) => (
          <div key={s.key} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image src={s.src} alt={s.alt} fill sizes="100vw" className="object-cover" />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
