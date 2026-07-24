"use client";

import { useState } from "react";
import {
  ImageIcon,
  Video,
  Music,
  ChevronDown,
  Sparkles,
  Upload,
  BarChart3,
  Smartphone,
  Expand,
  Zap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Modality = "image" | "video" | "audio";

const TABS: { id: Modality; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Imagem", icon: ImageIcon },
  { id: "video", label: "Vídeo", icon: Video },
  { id: "audio", label: "Áudio", icon: Music },
];

const PLACEHOLDER: Record<Modality, string> = {
  image: "Descreva a imagem que você quer criar...",
  video: "Descreva o vídeo que você quer criar...",
  audio: "Descreva o áudio que você quer criar...",
};

const DEFAULT_MODEL: Record<Modality, string> = {
  image: "Flux Dev",
  video: "Seedance 2.0",
  audio: "ElevenLabs v3",
};

const CREDIT_COST: Record<Modality, number> = {
  image: 1,
  video: 20,
  audio: 6,
};

function Control({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground transition-colors hover:bg-secondary/70"
    >
      {children}
    </button>
  );
}

export function GenerationDock() {
  const [active, setActive] = useState<Modality>("video");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para gerar.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/generate/${active}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data?.ok) {
        toast.success("Geração enviada! Acompanhe na galeria.");
      } else {
        toast.info("Endpoint de geração ainda não conectado ao provedor.");
      }
    } catch {
      toast.error("Não foi possível enviar a geração.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="fixed bottom-4 left-[calc(50%+110px)] z-30 w-[min(1100px,calc(100vw-260px))] -translate-x-1/2 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={cn(
              "flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm transition-colors",
              active === id
                ? "border-b-2 border-primary bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              className={cn("h-4 w-4", active === id && "text-accent")}
            />
            {label}
          </button>
        ))}
      </div>
      <div className="mx-4 h-px bg-border" />

      {/* Prompt + controls */}
      <div className="px-5 py-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleGenerate();
            }}
            placeholder={PLACEHOLDER[active]}
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Control>
              <BarChart3 className="h-4 w-4 text-accent" />
              {DEFAULT_MODEL[active]}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Control>
            {active !== "audio" && (
              <Control>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                9:16
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Control>
            )}
            {active === "video" && (
              <Control>
                <Expand className="h-4 w-4 text-muted-foreground" />
                720p
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Control>
            )}
            <Control>
              <Upload className="h-4 w-4 text-muted-foreground" />
              Referência
            </Control>
            <Control>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Wise Enhance
            </Control>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold shadow-lg shadow-primary/30"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Gerar
                <Zap className="h-4 w-4" fill="currentColor" />
                <span>{CREDIT_COST[active]}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
