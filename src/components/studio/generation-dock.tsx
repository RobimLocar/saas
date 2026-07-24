"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ImageIcon,
  Video,
  Music,
  ChevronDown,
  Sparkles,
  Upload,
  Cpu,
  Ratio,
  Expand,
  Clock,
  Zap,
  Loader2,
  Wand2,
  Check,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useStudioStore } from "@/stores/use-studio-store";
import { ASSIST_CATEGORIES } from "@/lib/assist-presets";

type Modality = "image" | "video" | "audio";

interface ApiModel {
  id: string;
  name: string;
  provider: string;
  type: Modality;
  model_id: string;
  credit_cost: number;
  min_plan: string;
  family: string;
  available: boolean;
}

const TABS: { id: Modality; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Imagem", icon: ImageIcon },
  { id: "video", label: "Vídeo", icon: Video },
  { id: "audio", label: "Áudio", icon: Music },
];

const PLACEHOLDER: Record<Modality, string> = {
  image: "Descreva a imagem que você quer criar...",
  video: "Descreva o vídeo que você quer criar...",
  audio: "Descreva o áudio / a música que você quer criar...",
};

// Opções de proporção por modalidade (iguais ao vídeo de referência)
const ASPECT_RATIOS: Record<"image" | "video", string[]> = {
  image: ["Auto", "1:1", "3:4", "9:16", "4:3", "3:2", "16:9"],
  video: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9"],
};

const RESOLUTIONS: Record<"image" | "video", string[]> = {
  image: ["1K", "2K", "4K"],
  video: ["480p", "720p", "1080p"],
};

/* -------------------------------------------------------------------------- */
/*  Popover leve (sem Floating UI) — abre para cima, fecha no clique fora      */
/* -------------------------------------------------------------------------- */
function Popover({
  trigger,
  children,
  panelClassName,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground transition-colors hover:bg-secondary/70"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl",
            panelClassName
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function OptionRow({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
        active && "bg-secondary"
      )}
    >
      {children}
    </button>
  );
}

function ControlButton({
  icon: Icon,
  children,
  onClick,
  active,
}: {
  icon: typeof Cpu;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-secondary text-foreground hover:bg-secondary/70"
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
      {children}
    </button>
  );
}

export function GenerationDock() {
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const prompt = useStudioStore((s) => s.prompt);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const selectedModelSlug = useStudioStore((s) => s.selectedModelSlug);
  const setSelectedModelSlug = useStudioStore((s) => s.setSelectedModelSlug);
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const resolution = useStudioStore((s) => s.resolution);
  const setResolution = useStudioStore((s) => s.setResolution);
  const duration = useStudioStore((s) => s.duration);
  const setDuration = useStudioStore((s) => s.setDuration);
  const triggerRefresh = useStudioStore((s) => s.triggerRefresh);
  const setViewFilter = useStudioStore((s) => s.setViewFilter);

  const [models, setModels] = useState<ApiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);

  // Carregar modelos da modalidade ativa
  const loadModels = useCallback(async (type: Modality) => {
    try {
      const res = await fetch(`/api/models?type=${type}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    loadModels(activeTab);
  }, [activeTab, loadModels]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === selectedModelSlug),
    [models, selectedModelSlug]
  );

  // Agrupar modelos por família (Kling, Seedance, Veo, ...)
  const grouped = useMemo(() => {
    const map = new Map<string, ApiModel[]>();
    for (const m of models) {
      const key = m.family || "Outros";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [models]);

  const creditCost = selectedModel?.credit_cost ?? 1;

  function appendToPrompt(snippet: string) {
    setPrompt(prompt.trim() ? `${prompt.trim()}, ${snippet}` : snippet);
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para gerar.");
      return;
    }
    if (selectedModel && !selectedModel.available) {
      toast.error(
        `O modelo ${selectedModel.name} ainda não está integrado. Escolha um modelo disponível.`
      );
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        prompt,
        model_slug: selectedModelSlug,
      };
      if (activeTab !== "audio") {
        body.aspect_ratio = aspectRatio;
      }
      if (activeTab === "video") {
        body.duration = duration;
        body.resolution = resolution;
      }

      const res = await fetch(`/api/generate/${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data?.generation_id) {
        toast.success("Geração enviada! Acompanhe na galeria.");
        setPrompt("");
        setViewFilter("all");
        triggerRefresh();
      } else {
        toast.error(data?.error || "Não foi possível enviar a geração.");
      }
    } catch {
      toast.error("Não foi possível enviar a geração.");
    } finally {
      setLoading(false);
    }
  }

  const showAspect = activeTab !== "audio";
  const showResolution = activeTab === "video" || activeTab === "image";
  const resolutionOptions =
    activeTab === "video" ? RESOLUTIONS.video : RESOLUTIONS.image;
  const aspectOptions =
    activeTab === "video" ? ASPECT_RATIOS.video : ASPECT_RATIOS.image;
  const resolutionValue = resolutionOptions.includes(resolution)
    ? resolution
    : resolutionOptions[1] || resolutionOptions[0];

  return (
    <section className="fixed bottom-4 left-[calc(50%+110px)] z-30 w-[min(1100px,calc(100vw-260px))] -translate-x-1/2 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur">
      {/* Painel Assist */}
      {assistOpen && (
        <div className="max-h-[340px] overflow-y-auto border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wand2 className="h-4 w-4 text-primary" />
              Assist — construir prompt
            </div>
            <button
              type="button"
              onClick={() => setAssistOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
          <div className="space-y-3">
            {ASSIST_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => appendToPrompt(opt)}
                      className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:bg-primary/10"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm transition-colors",
              activeTab === id
                ? "border-b-2 border-primary bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("h-4 w-4", activeTab === id && "text-accent")} />
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
            placeholder={PLACEHOLDER[activeTab]}
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de modelo */}
            <Popover
              panelClassName="max-h-[360px] w-72"
              trigger={() => (
                <>
                  <Cpu className="h-4 w-4 text-accent" />
                  {selectedModel?.name || "Selecionar modelo"}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </>
              )}
            >
              {(close) =>
                grouped.map(([family, list], idx) => (
                  <div key={family}>
                    {idx > 0 && <div className="my-1 h-px bg-border" />}
                    <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {family}
                    </p>
                    {list.map((m) => (
                      <OptionRow
                        key={m.id}
                        active={m.model_id === selectedModelSlug}
                        onClick={() => {
                          setSelectedModelSlug(m.model_id);
                          close();
                        }}
                      >
                        <span className="flex items-center gap-2">
                          {m.model_id === selectedModelSlug && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          )}
                          <span
                            className={cn(
                              m.model_id === selectedModelSlug && "font-medium",
                              !m.available && "text-muted-foreground"
                            )}
                          >
                            {m.name}
                          </span>
                          {!m.available && (
                            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Zap className="h-3 w-3" fill="currentColor" />
                          {m.credit_cost}
                        </span>
                      </OptionRow>
                    ))}
                  </div>
                ))
              }
            </Popover>

            {/* Proporção */}
            {showAspect && (
              <Popover
                panelClassName="w-32"
                trigger={() => (
                  <>
                    <Ratio className="h-4 w-4 text-muted-foreground" />
                    {aspectRatio}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
              >
                {(close) =>
                  aspectOptions.map((r) => (
                    <OptionRow
                      key={r}
                      active={r === aspectRatio}
                      onClick={() => {
                        setAspectRatio(r);
                        close();
                      }}
                    >
                      <span>{r}</span>
                      {r === aspectRatio && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </OptionRow>
                  ))
                }
              </Popover>
            )}

            {/* Resolução */}
            {showResolution && (
              <Popover
                panelClassName="w-28"
                trigger={() => (
                  <>
                    <Expand className="h-4 w-4 text-muted-foreground" />
                    {resolutionValue}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
              >
                {(close) =>
                  resolutionOptions.map((r) => (
                    <OptionRow
                      key={r}
                      active={r === resolutionValue}
                      onClick={() => {
                        setResolution(r);
                        close();
                      }}
                    >
                      <span>{r}</span>
                      {r === resolutionValue && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </OptionRow>
                  ))
                }
              </Popover>
            )}

            {/* Duração (vídeo) */}
            {activeTab === "video" && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Slider
                  className="w-24"
                  min={4}
                  max={15}
                  step={1}
                  value={[duration]}
                  onValueChange={(v) =>
                    setDuration(Array.isArray(v) ? v[0] : (v as number))
                  }
                />
                <span className="w-8 tabular-nums text-muted-foreground">
                  {duration}s
                </span>
              </div>
            )}

            {/* Assist */}
            <ControlButton
              icon={Wand2}
              active={assistOpen}
              onClick={() => setAssistOpen((v) => !v)}
            >
              Assist
            </ControlButton>

            {/* Referência (em breve) */}
            <ControlButton
              icon={Upload}
              onClick={() =>
                toast.info("Upload de referência estará disponível em breve.")
              }
            >
              Referência
            </ControlButton>

            {/* Wise Enhance (em breve) */}
            <ControlButton
              icon={Sparkles}
              onClick={() =>
                toast.info("Wise Enhance estará disponível em breve.")
              }
            >
              Wise Enhance
            </ControlButton>
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
                <span>{creditCost}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
