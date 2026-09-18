"use client";

// FLUXYRA-LANDING-MOTION-PASS-05 — small set of reusable, restrained motion
// primitives for the marketing surface only. Animates transform/opacity
// exclusively (never width/height/top/left — see task §14). Global
// prefers-reduced-motion handling comes from <MotionConfig reducedMotion="user">
// wrapping the marketing layout (framer-motion strips transform-based motion
// for reduced-motion users automatically, keeping simple opacity fades).

import { useEffect, useRef, useState } from "react";
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

/** Cinematic media reveal — scale 1.03 → 1 + opacity, for large editorial
 * images/screenshots (task §5/§6). Container should keep overflow-hidden.
 * Same mount/view trigger choice as Reveal. */
export function RevealMedia({
  children,
  delay = 0,
  mode = "view",
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  mode?: "mount" | "view";
  className?: string;
}) {
  const triggerProps =
    mode === "mount"
      ? { initial: { opacity: 0, scale: 1.02 }, animate: { opacity: 1, scale: 1 } }
      : {
          initial: { opacity: 0, scale: 1.03 },
          whileInView: { opacity: 1, scale: 1 },
          viewport: { once: true, margin: "-80px" },
        };
  return (
    <motion.div className={className} {...triggerProps} transition={{ duration: 0.7, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Hero media: scale-in on mount (1.02 → 1) plus a very light vertical
 * parallax while scrolling past it (~28px total — task §4: "aprox. 20–40px
 * total", never moves the focal point aggressively). Only transform is
 * animated; useReducedMotion disables the scroll-linked parallax entirely
 * while keeping the one-time scale/opacity settle. */
export function ParallaxHeroMedia({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [-14, 14]);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE }}
      style={{ y }}
    >
      {children}
    </motion.div>
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
      duration: reduceMotion ? 0 : 1.1,
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

/** Slow, elegant infinite marquee. Pauses on hover (desktop). Falls back to
 * a plain static wrapped row for prefers-reduced-motion (task §8/§14). */
export function Marquee({ items }: { items: string[] }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
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
