"use client";

// FLUXYRA-LANDING-MOTION-PASS-05/06 — reusable, restrained motion primitives
// for the marketing surface only. Animates transform/opacity exclusively
// (see task §19 — width/height/top/left are never scroll-driven; the one
// exception, a single fixed navbar's padding/height on a discrete scroll
// threshold, lives in navbar.tsx, not here). Global prefers-reduced-motion
// handling comes from <MotionConfig reducedMotion="user"> wrapping the
// marketing layout (framer-motion strips transform-based motion for
// reduced-motion users automatically, keeping simple opacity fades).

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  animate,
  type Variants,
} from "framer-motion";

/** Premium ease-out — no bounce/spring, per task §1. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade + translateY. `view` (default) triggers once on scroll into view;
 * `mount` triggers immediately — for above-the-fold content like the hero,
 * where there's nothing to "scroll into". */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  mode = "view",
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  mode?: "mount" | "view";
  className?: string;
}) {
  const triggerProps =
    mode === "mount"
      ? { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-80px" },
        };
  return (
    <motion.div className={className} {...triggerProps} transition={{ duration: 0.6, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Mask reveal per line — overflow-hidden per line, inner span slides
 * y:110% -> 0%. Use only for hero / major section headings / the dark flow
 * heading (task §14) — never for body copy. Renders as inline `motion.span`
 * content only; the caller supplies the real semantic heading tag
 * (h1/h2/etc.) around it, e.g. `<h1><MaskedTextReveal lines={[...]} /></h1>`. */
export function MaskedTextReveal({
  lines,
  className,
  lineClassName,
  delay = 0,
  stagger = 0.09,
  mode = "view",
}: {
  lines: string[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
  mode?: "mount" | "view";
}) {
  const containerProps =
    mode === "mount"
      ? { initial: "hidden", animate: "visible" as const }
      : { initial: "hidden", whileInView: "visible" as const, viewport: { once: true, margin: "-100px" } };
  return (
    <motion.span
      className={className}
      custom={stagger}
      variants={{
        hidden: {},
        visible: (s: number) => ({ transition: { staggerChildren: s, delayChildren: delay } }),
      }}
      {...containerProps}
      style={{ display: "block" }}
    >
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden">
          <motion.span
            className={lineClassName}
            style={{ display: "block" }}
            variants={{ hidden: { y: "110%" }, visible: { y: "0%", transition: { duration: 0.7, ease: EASE } } }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Centralized editorial image: reveal (scale-in + opacity) + explicit crop
 * (objectPosition) + optional scroll parallax — the one place object-position
 * is configured, never scattered inline (task §15). */
export function EditorialMedia({
  src,
  alt,
  aspect = "aspect-video",
  objectPosition,
  parallax = false,
  parallaxRange = 22,
  priority = false,
  mode = "view",
  delay = 0,
  className,
  sizes = "100vw",
}: {
  src: string;
  alt: string;
  aspect?: string;
  objectPosition?: string;
  parallax?: boolean;
  parallaxRange?: number;
  priority?: boolean;
  mode?: "mount" | "view";
  delay?: number;
  className?: string;
  sizes?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const half = parallaxRange / 2;
  const y = useTransform(scrollYProgress, [0, 1], parallax && !reduceMotion ? [-half, half] : [0, 0]);

  const triggerProps =
    mode === "mount"
      ? { initial: { opacity: 0, scale: 1.08, y: 40 }, animate: { opacity: 1, scale: 1, y: 0 } }
      : {
          initial: { opacity: 0, scale: 1.05 },
          whileInView: { opacity: 1, scale: 1 },
          viewport: { once: true, margin: "-80px" },
        };

  return (
    <div ref={ref} className={`relative overflow-hidden ${aspect} ${className ?? ""}`}>
      <motion.div
        className="absolute inset-0"
        {...triggerProps}
        transition={{ duration: mode === "mount" ? 1 : 0.8, delay, ease: EASE }}
        style={{ y }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover"
          style={objectPosition ? { objectPosition } : undefined}
        />
      </motion.div>
    </div>
  );
}

/** A line that grows from 0 to full width once in view (task §8 — the dark
 * section's step connector). transformOrigin left, scaleX only. */
export function GrowLine({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      style={{ transformOrigin: "left" }}
    />
  );
}

const staggerParent: Variants = {
  hidden: {},
  visible: (stagger: number) => ({ transition: { staggerChildren: stagger } }),
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Stagger container. `mount` triggers immediately (above-the-fold, e.g.
 * hero copy); `view` triggers once when scrolled into view (everything
 * else). */
export function Stagger({
  children,
  className,
  stagger = 0.1,
  mode = "view",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  mode?: "mount" | "view";
}) {
  const viewProps =
    mode === "mount"
      ? { initial: "hidden", animate: "visible" as const }
      : { initial: "hidden", whileInView: "visible" as const, viewport: { once: true, margin: "-80px" } };
  return (
    <motion.div className={className} custom={stagger} variants={staggerParent} {...viewProps}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

/** Count up once when it enters the viewport. Verified numbers only — see
 * task §10 (no restoring removed/unverified claims here). */
export function CountUp({ to, className }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    // reduceMotion collapses to an instant (duration 0) jump, still routed
    // through animate()'s onUpdate rather than a bare setState call in the
    // effect body.
    const controls = animate(0, to, {
      duration: reduceMotion ? 0 : 1,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

/** Slow, elegant infinite text marquee (models strip). Pauses on hover
 * (desktop). Falls back to a plain static wrapped row for
 * prefers-reduced-motion. */
export function Marquee({ items }: { items: string[] }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
        {items.map((m) => (
          <span key={m} className="text-sm font-medium tracking-wide text-muted-foreground">
            {m}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="animate-marquee flex w-max items-center gap-12 hover:[animation-play-state:paused]">
        {[...items, ...items].map((m, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-medium tracking-wide text-muted-foreground">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface MarqueeMediaItem {
  src: string;
  alt: string;
  width: number;
}

/** Wide image marquee row for the output gallery — variable card widths,
 * configurable direction/duration, pause-on-hover. Mobile/reduced-motion:
 * plain horizontal snap-scroll, no autoplay (task §10). */
export function MarqueeRow({
  items,
  direction = "left",
  durationSec = 40,
  height = 300,
}: {
  items: MarqueeMediaItem[];
  direction?: "left" | "right";
  durationSec?: number;
  height?: number;
}) {
  const reduceMotion = useReducedMotion();

  const cards = (list: MarqueeMediaItem[], dup: boolean) =>
    (dup ? [...list, ...list] : list).map((it, i) => (
      <div
        key={i}
        className="relative shrink-0 overflow-hidden rounded-[20px] border border-border shadow-sm"
        style={{ width: it.width, height }}
      >
        <Image src={it.src} alt={it.alt} fill sizes={`${it.width}px`} className="object-cover" />
      </div>
    ));

  if (reduceMotion) {
    return (
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:hidden">{cards(items, false)}</div>
    );
  }

  const animClass = direction === "left" ? "animate-marquee-x" : "animate-marquee-x-rev";
  return (
    <>
      {/* Mobile: manual scroll, no autoplay, regardless of motion preference */}
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:hidden">{cards(items, false)}</div>
      {/* Desktop/tablet: continuous marquee */}
      <div className="group relative hidden overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] md:block">
        <div
          className={`flex w-max items-center gap-5 ${animClass} group-hover:[animation-play-state:paused]`}
          style={{ "--marquee-duration": `${durationSec}s` } as CSSProperties}
        >
          {cards(items, true)}
        </div>
      </div>
    </>
  );
}
