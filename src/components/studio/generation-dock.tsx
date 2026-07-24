"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AtSign,
  BarChart3,
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  Music,
  Sparkles,
  Triangle,
  Upload,
  Video,
  Volume2,
  Wand2,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  image: "Descreva sua imagem...",
  video: "Descreva seu vídeo...",
  audio: "Descreva seu áudio...",
};

const ASPECT_RATIOS: Record<"image" | "video", string[]> = {
  image: ["1:1", "3:4", "9:16", "4:3", "3:2", "16:9"],
  video: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9"],
};

const RESOLUTIONS: Record<"image" | "video", string[]> = {
  image: ["1K", "2K", "4K"],
  video: ["480p", "720p", "1080p"],
};

const MODEL_CAPABILITIES_OVERRIDES: Record<string, { ref: boolean; batch: boolean; description: string }> = {
  "nano banana pro": {
    ref: true,
    batch: true,
    description: "Saída de até 4K",
  },
  "nano banana 2": {
    ref: true,
    batch: true,
    description: "Geração Gemini em alta velocidade",
  },
  "flux.2 pro": {
    ref: true,
    batch: true,
    description: "Imagens fotorrealistas profissionais",
  },
  "seedream 4.5": {
    ref: true,
    batch: true,
    description: "Geração e edição de imagens ByteDance em 4K",
  },
  "seedream 5.0 lite": {
    ref: true,
    batch: true,
    description: "Geração e edição com raciocínio rápido",
  },
  "seedream 4.0": {
    ref: false,
    batch: true,
    description: "Criação ByteDance — saída HD",
  },
};

function getModelCapabilities(model: ApiModel) {
  const key = model.name.trim().toLowerCase();
  const fromOverride = MODEL_CAPABILITIES_OVERRIDES[key];
  if (fromOverride) return fromOverride;

  const probe = `${model.name} ${model.family} ${model.provider} ${model.model_id}`.toLowerCase();
  return {
    ref: /flux|banana|seedream|gemini|kling|veo/.test(probe),
    batch: model.type === "image",
    description: `${model.family || "Modelo"} • ${model.provider}`,
  };
}

function modelIcon(model: ApiModel) {
  const probe = `${model.name} ${model.family} ${model.provider} ${model.model_id}`.toLowerCase();
  if (probe.includes("gemini") || probe.includes("banana") || probe.includes("google")) {
    return <span className="text-sm font-bold text-zinc-200">G</span>;
  }
  if (probe.includes("flux")) {
    return <Triangle className="h-3.5 w-3.5 text-zinc-200" />;
  }
  return <BarChart3 className="h-3.5 w-3.5 text-zinc-200" />;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function Popover({
  trigger,
  children,
  panelClassName,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-zinc-800/80 px-3 text-sm text-zinc-100 transition hover:bg-zinc-700/80"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl",
            panelClassName
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function TextBadge({ label, tone }: { label: string; tone: "ref" | "batch" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        tone === "ref"
          ? "bg-blue-950/80 text-blue-200"
          : "bg-emerald-950/80 text-emerald-200"
      )}
    >
      {label}
    </span>
  );
}

function UploadZone({
  title,
  preview,
  onClick,
}: {
  title: string;
  preview: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-zinc-900/60 text-zinc-300 transition hover:border-primary/60 hover:bg-zinc-900"
    >
      {preview ? (
        <Image src={preview} alt={title} fill className="object-cover" unoptimized />
      ) : (
        <div className="flex flex-col items-center gap-1 text-xs">
          <Upload className="h-4 w-4" />
          <span>{title}</span>
        </div>
      )}
      <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-zinc-200">
        {title}
      </span>
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
  const duration = useStudioStore((s) => s.duration);
  const setDuration = useStudioStore((s) => s.setDuration);
  const resolution = useStudioStore((s) => s.resolution);
  const setResolution = useStudioStore((s) => s.setResolution);
  const batchCount = useStudioStore((s) => s.batchCount);
  const setBatchCount = useStudioStore((s) => s.setBatchCount);
  const referenceTab = useStudioStore((s) => s.referenceTab);
  const setReferenceTab = useStudioStore((s) => s.setReferenceTab);
  const referenceImageUrl = useStudioStore((s) => s.referenceImageUrl);
  const setReferenceImageUrl = useStudioStore((s) => s.setReferenceImageUrl);
  const startImageUrl = useStudioStore((s) => s.startImageUrl);
  const setStartImageUrl = useStudioStore((s) => s.setStartImageUrl);
  const endImageUrl = useStudioStore((s) => s.endImageUrl);
  const setEndImageUrl = useStudioStore((s) => s.setEndImageUrl);
  const triggerRefresh = useStudioStore((s) => s.triggerRefresh);
  const setViewFilter = useStudioStore((s) => s.setViewFilter);

  const [models, setModels] = useState<ApiModel[]>([]);
  const [assistOpen, setAssistOpen] = useState(false);
  const [referenceEnabled, setReferenceEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const omniInputRef = useRef<HTMLInputElement>(null);

  const loadModels = useCallback(async (type: Modality) => {
    try {
      const res = await fetch(`/api/models?type=${type}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setModels(data.models || []);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadModels(activeTab);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadModels]);

  useEffect(() => {
    if (!models.length) return;
    const exists = models.some((m) => m.model_id === selectedModelSlug);
    if (!exists) {
      setSelectedModelSlug(models[0].model_id);
    }
  }, [models, selectedModelSlug, setSelectedModelSlug]);

  useEffect(() => {
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = "0px";
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 180)}px`;
  }, [prompt]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === selectedModelSlug) ?? null,
    [models, selectedModelSlug]
  );

  const aspectOptions = activeTab === "video" ? ASPECT_RATIOS.video : ASPECT_RATIOS.image;
  const resolutionOptions = activeTab === "video" ? RESOLUTIONS.video : RESOLUTIONS.image;
  const safeAspect = aspectOptions.includes(aspectRatio) ? aspectRatio : aspectOptions[0];
  const safeResolution = resolutionOptions.includes(resolution)
    ? resolution
    : resolutionOptions[Math.min(1, resolutionOptions.length - 1)];
  const baseCost = selectedModel?.credit_cost ?? 1;
  const totalCost = activeTab === "image" ? baseCost * batchCount : baseCost;

  function appendToPrompt(snippet: string) {
    const head = prompt.trim();
    setPrompt(head ? `${head}, ${snippet}` : snippet);
  }

  async function onPickFile(
    event: ChangeEvent<HTMLInputElement>,
    setter: (url: string | null) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const url = await toDataUrl(file);
      setter(url);
      toast.success("Imagem de referência adicionada.");
    } catch {
      toast.error("Não foi possível carregar esta imagem.");
    } finally {
      event.target.value = "";
    }
  }

  async function submitSingleGeneration() {
    const body: Record<string, unknown> = {
      prompt,
      model_slug: selectedModelSlug,
    };

    if (activeTab === "image") {
      body.aspect_ratio = safeAspect;
      body.resolution = safeResolution;
      if (referenceEnabled && referenceImageUrl) {
        body.reference_image_url = referenceImageUrl;
      }
    }

    if (activeTab === "video") {
      body.aspect_ratio = safeAspect;
      body.duration = duration;
      body.resolution = safeResolution;
      if (referenceEnabled) {
        if (referenceTab === "omni" && referenceImageUrl) {
          body.start_image_url = referenceImageUrl;
        }
        if (referenceTab === "start-end") {
          if (startImageUrl) body.start_image_url = startImageUrl;
          if (endImageUrl) body.end_image_url = endImageUrl;
        }
      }
      body.with_audio = soundEnabled;
    }

    const res = await fetch(`/api/generate/${activeTab}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Falha ao gerar");
    }

    return data;
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para gerar.");
      return;
    }

    if (selectedModel && !selectedModel.available) {
      toast.error("Este modelo ainda não está disponível para geração.");
      return;
    }

    if (activeTab === "video" && referenceEnabled && referenceTab === "start-end") {
      if (!startImageUrl && !endImageUrl) {
        toast.error("Adicione pelo menos um frame de referência.");
        return;
      }
    }

    if (activeTab === "video" && referenceEnabled && referenceTab === "omni" && !referenceImageUrl) {
      toast.error("Adicione uma imagem em Referência Omni.");
      return;
    }

    setLoading(true);
    try {
      if (activeTab === "image" && batchCount > 1) {
        const jobs = Array.from({ length: batchCount }).map(() => submitSingleGeneration());
        const results = await Promise.allSettled(jobs);
        const successCount = results.filter((r) => r.status === "fulfilled").length;
        if (successCount === 0) {
          throw new Error("Nenhuma geração foi enviada.");
        }
        toast.success(`${successCount} gerações enviadas para a fila.`);
      } else {
        await submitSingleGeneration();
        toast.success("Geração enviada! Acompanhe no feed.");
      }

      setPrompt("");
      setViewFilter("all");
      triggerRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a geração.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="fixed bottom-4 left-[calc(50%+110px)] z-30 w-[min(1160px,calc(100vw-260px))] -translate-x-1/2 rounded-3xl border border-white/10 bg-zinc-950/95 shadow-[0_12px_50px_rgba(0,0,0,.45)] backdrop-blur">
      {assistOpen && (
        <div className="max-h-[320px] overflow-y-auto border-b border-white/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Wand2 className="h-4 w-4 text-primary" />
              Assist — construir prompt
            </div>
            <button
              type="button"
              onClick={() => setAssistOpen(false)}
              className="text-xs text-zinc-400 transition hover:text-zinc-100"
            >
              Fechar
            </button>
          </div>

          <div className="space-y-3">
            {ASSIST_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  {cat.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => appendToPrompt(opt)}
                      className="rounded-full border border-white/10 bg-zinc-800 px-3 py-1 text-xs text-zinc-100 transition hover:border-primary/50 hover:bg-primary/10"
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

      <div className="flex items-center gap-2 px-4 pt-3">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-primary")} />
              <span>{label}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>

      <div className="mx-4 mt-2 h-px bg-white/10" />

      <div className="px-5 py-4">
        <textarea
          ref={textAreaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !loading) {
              handleGenerate();
            }
          }}
          rows={1}
          placeholder={PLACEHOLDER[activeTab]}
          className="max-h-[180px] min-h-[40px] w-full resize-none bg-transparent text-[15px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </div>

      {activeTab === "video" && (
        <div className="mx-5 mb-4 rounded-2xl border border-white/10 bg-zinc-900/70 p-3">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReferenceTab("start-end")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition",
                referenceTab === "start-end"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/60"
              )}
            >
              Frame inicial/final
            </button>
            <button
              type="button"
              onClick={() => setReferenceTab("omni")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition",
                referenceTab === "omni"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/60"
              )}
            >
              Referência Omni
            </button>
          </div>

          {referenceTab === "start-end" ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <UploadZone
                title="Frame inicial"
                preview={startImageUrl}
                onClick={() => startInputRef.current?.click()}
              />
              <button
                type="button"
                onClick={() => {
                  const oldStart = startImageUrl;
                  setStartImageUrl(endImageUrl);
                  setEndImageUrl(oldStart);
                }}
                className="rounded-full border border-white/10 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 transition hover:bg-zinc-700"
                aria-label="Trocar frame inicial e final"
              >
                ⇄
              </button>
              <UploadZone
                title="Frame final"
                preview={endImageUrl}
                onClick={() => endInputRef.current?.click()}
              />
            </div>
          ) : (
            <UploadZone
              title="Referência Omni"
              preview={referenceImageUrl}
              onClick={() => omniInputRef.current?.click()}
            />
          )}

          <input
            ref={startInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickFile(e, setStartImageUrl)}
          />
          <input
            ref={endInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickFile(e, setEndImageUrl)}
          />
          <input
            ref={omniInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickFile(e, setReferenceImageUrl)}
          />
        </div>
      )}

      <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Popover
            panelClassName="max-h-[360px] w-[360px] overflow-y-auto"
            trigger={(open) => (
              <>
                <span className="grid h-6 w-6 place-items-center rounded-md bg-zinc-700/80">
                  {selectedModel ? modelIcon(selectedModel) : <Sparkles className="h-3.5 w-3.5 text-zinc-200" />}
                </span>
                <span className="max-w-[170px] truncate">{selectedModel?.name || "Selecionar modelo"}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-400 transition", open && "rotate-180")} />
              </>
            )}
          >
            {(close) => (
              <div className="space-y-1">
                {models.map((model) => {
                  const caps = getModelCapabilities(model);
                  const active = model.model_id === selectedModelSlug;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModelSlug(model.model_id);
                        close();
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition",
                        active ? "bg-zinc-800" : "hover:bg-zinc-800/70"
                      )}
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-700/80">
                        {modelIcon(model)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-zinc-100">{model.name}</span>
                          {caps.ref && <TextBadge label="REF" tone="ref" />}
                          {caps.batch && <TextBadge label="BATCH" tone="batch" />}
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">{caps.description}</span>
                      </span>

                      {active && <Check className="mt-1 h-4 w-4 shrink-0 text-zinc-100" />}
                    </button>
                  );
                })}
              </div>
            )}
          </Popover>

          <Popover
            panelClassName="w-28"
            trigger={(open) => (
              <>
                <span>{safeAspect}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-400 transition", open && "rotate-180")} />
              </>
            )}
          >
            {(close) => (
              <div className="space-y-1">
                {aspectOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setAspectRatio(opt);
                      close();
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-100 transition hover:bg-zinc-800",
                      safeAspect === opt && "bg-zinc-800"
                    )}
                  >
                    <span>{opt}</span>
                    {safeAspect === opt && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          {activeTab === "video" && (
            <div className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-zinc-800/80 px-3 text-sm text-zinc-100">
              <input
                type="range"
                min={4}
                max={15}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-blue-500/30 accent-blue-500"
              />
              <span className="w-8 text-xs text-zinc-300">{duration}s</span>
            </div>
          )}

          <Popover
            panelClassName="w-28"
            trigger={(open) => (
              <>
                <span>{safeResolution}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-400 transition", open && "rotate-180")} />
              </>
            )}
          >
            {(close) => (
              <div className="space-y-1">
                {resolutionOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setResolution(opt);
                      close();
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-100 transition hover:bg-zinc-800",
                      safeResolution === opt && "bg-zinc-800"
                    )}
                  >
                    <span>{opt}</span>
                    {safeResolution === opt && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          {activeTab === "video" && (
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className={cn(
                "flex h-9 items-center justify-center rounded-xl border px-3 text-sm transition",
                soundEnabled
                  ? "border-blue-500/50 bg-blue-500/20 text-blue-100"
                  : "border-white/10 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700/80"
              )}
            >
              <Volume2 className="h-4 w-4" />
            </button>
          )}

          {activeTab === "image" && (
            <div className="flex h-9 items-center gap-3 rounded-xl border border-white/10 bg-zinc-800/80 px-2 text-sm text-zinc-100">
              <button
                type="button"
                onClick={() => setBatchCount(batchCount - 1)}
                className="rounded px-1.5 py-0.5 text-zinc-300 transition hover:bg-zinc-700"
              >
                —
              </button>
              <span className="min-w-4 text-center tabular-nums">{batchCount}</span>
              <button
                type="button"
                onClick={() => setBatchCount(batchCount + 1)}
                className="rounded px-1.5 py-0.5 text-zinc-300 transition hover:bg-zinc-700"
              >
                +
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => toast.info("Menções em breve.")}
            className="flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-zinc-800/80 px-3 text-sm text-zinc-200 transition hover:bg-zinc-700/80"
          >
            <AtSign className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setReferenceEnabled((v) => !v)}
            className={cn(
              "flex h-9 items-center gap-1 rounded-xl border px-3 text-sm transition",
              referenceEnabled
                ? "border-blue-500/40 bg-blue-500/15 text-blue-100"
                : "border-white/10 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700/80"
            )}
          >
            Referência
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          <button
            type="button"
            onClick={() => setAssistOpen((v) => !v)}
            className={cn(
              "flex h-9 items-center gap-1 rounded-xl border px-3 text-sm transition",
              assistOpen
                ? "border-primary/50 bg-primary/20 text-zinc-100"
                : "border-white/10 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700/80"
            )}
          >
            Assist
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          <button
            type="button"
            onClick={() => toast.info("Wise Enhance estará disponível em breve.")}
            className="flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-zinc-800/60 px-3 text-sm text-zinc-500"
          >
            <Sparkles className="h-4 w-4" />
            Wise Enhance
          </button>
        </div>

        <Button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              Gerar
              <Zap className="h-4 w-4" fill="currentColor" />
              <span>{totalCost}</span>
            </span>
          )}
        </Button>
      </div>
    </section>
  );
}
