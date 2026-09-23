"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * P5g1 — Player de áudio multi-output (provider-agnostic). Um único <audio>
 * ativo por card; seletor compacto de números aparece SOMENTE quando há >1
 * output (single-output permanece visualmente idêntico ao comportamento atual).
 * Trocar de output remonta o <audio> (key=src) → reseta o playback naturalmente,
 * sem tocar dois outputs ao mesmo tempo. Seleção é state LOCAL (não global, não
 * persistida). NÃO conhece Kling.
 */
export function MultiAudioPlayer({
  urls,
  className,
  autoPlay = false,
  onClick,
}: {
  urls: string[];
  className?: string;
  autoPlay?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [index, setIndex] = useState(0);
  if (urls.length === 0) return null;
  const active = Math.min(index, urls.length - 1);

  return (
    <div className={className} onClick={onClick}>
      {urls.length > 1 && (
        <div
          role="group"
          aria-label="Sound outputs"
          className="mb-2 flex flex-wrap gap-1"
        >
          {urls.map((_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Output ${n + 1}`}
              aria-pressed={active === n}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(n);
              }}
              className={cn(
                "h-7 w-7 rounded-md text-xs font-medium transition-colors duration-150",
                active === n
                  ? "bg-[#2A2A2A] text-[#F5F5F5]"
                  : "bg-[#1A1A1A] text-[#888888] hover:text-[#F5F5F5]"
              )}
            >
              {n + 1}
            </button>
          ))}
        </div>
      )}
      <audio
        key={urls[active]}
        src={urls[active]}
        controls
        autoPlay={autoPlay}
        className="w-full"
      />
    </div>
  );
}
