"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  AtSign,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Expand,
  ImageIcon,
  Loader2,
  Music,
  Smartphone,
  SlidersHorizontal,
  Upload,
  Video,
  Volume2,
  WandSparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  audio: "Descreva o áudio que você quer criar...",
};

const ASPECT_RATIOS: Record<"image" | "video", string[]> = {
  image: ["1:1", "3:4", "9:16", "4:3", "3:2", "16:9"],
  video: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9"],
};

const RESOLUTIONS: Record<"image" | "video", string[]> = {
  image: ["1K", "2K", "4K"],
  video: ["480p", "720p", "1080p"],
};

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

    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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
        className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-sm text-[#F5F5F5]"
      >
        {trigger(open)}
      </button>

      {open && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-1 shadow-2xl",
            panelClassName
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function ControlButton({
  children,
  icon,
  active,
  onClick,
  muted,
}: {
  children: ReactNode;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm",
        active
          ? "border-[#7C3AED] bg-[#7C3AED]/15 text-[#F5F5F5]"
          : "border-[#2A2A2A] bg-[#1A1A1A]",
        muted ? "text-[#888888]" : "text-[#F5F5F5]"
      )}
    >
      {icon}
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
  const [referenceEnabled, setReferenceEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

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
    const exists = models.some((item) => item.model_id === selectedModelSlug);
    if (!exists) setSelectedModelSlug(models[0].model_id);
  }, [models, selectedModelSlug, setSelectedModelSlug]);

  const selectedModel = useMemo(
    () => models.find((item) => item.model_id === selectedModelSlug) ?? null,
    [models, selectedModelSlug]
  );

  const aspectOptions = activeTab === "video" ? ASPECT_RATIOS.video : ASPECT_RATIOS.image;
  const resolutionOptions = activeTab === "video" ? RESOLUTIONS.video : RESOLUTIONS.image;
  const safeAspect = aspectOptions.includes(aspectRatio) ? aspectRatio : aspectOptions[0];
  const safeResolution = resolutionOptions.includes(resolution) ? resolution : resolutionOptions[0];
  const creditCost = selectedModel?.credit_cost ?? 1;
  const totalCost = activeTab === "image" ? creditCost * batchCount : creditCost;

  async function handlePickFile(
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: string | null) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await toDataUrl(file);
      setter(dataUrl);
      toast.success("Referência adicionada.");
    } catch {
      toast.error("Não foi possível ler a imagem.");
    } finally {
      event.target.value = "";
    }
  }

  function appendToPrompt(snippet: string) {
    const cleaned = prompt.trim();
    setPrompt(cleaned ? `${cleaned}, ${snippet}` : snippet);
  }

  async function submitSingleGeneration() {
    const body: Record<string, unknown> = {
      prompt,
      model_slug: selectedModelSlug,
    };

    if (activeTab !== "audio") {
      body.aspect_ratio = safeAspect;
    }

    if (activeTab === "image") {
      body.resolution = safeResolution;
      if (referenceEnabled && referenceImageUrl) {
        body.reference_image_url = referenceImageUrl;
      }
    }

    if (activeTab === "video") {
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
      body.with_audio = audioEnabled;
    }

    const res = await fetch(`/api/generate/${activeTab}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Falha ao enviar geração");
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para gerar.");
      return;
    }

    if (selectedModel && !selectedModel.available) {
      toast.error("Este modelo ainda não está disponível.");
      return;
    }

    setLoading(true);
    try {
      if (activeTab === "image" && batchCount > 1) {
        const jobs = Array.from({ length: batchCount }).map(() => submitSingleGeneration());
        const results = await Promise.allSettled(jobs);
        const successCount = results.filter((item) => item.status === "fulfilled").length;

        if (!successCount) throw new Error("Nenhuma geração foi enviada.");

        toast.success(`${successCount} gerações enviadas.`);
      } else {
        await submitSingleGeneration();
        toast.success("Geração enviada! Acompanhe no feed.");
      }

      setPrompt("");
      setViewFilter("all");
      triggerRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="fixed bottom-4 left-1/2 z-30 w-[1180px] -translate-x-1/2 rounded-2xl border border-[#2A2A2A] bg-[#141414]/95 shadow-2xl backdrop-blur">
      {assistOpen && (
        <div className="max-h-[320px] overflow-y-auto border-b border-[#2A2A2A] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F5F5]">
              <SlidersHorizontal className="h-4 w-4 text-[#8B5CF6]" />
              Assist — construir prompt
            </div>
            <button
              type="button"
              onClick={() => setAssistOpen(false)}
              className="text-xs text-[#888888] hover:text-[#F5F5F5]"
            >
              Fechar
            </button>
          </div>

          <div className="space-y-3">
            {ASSIST_CATEGORIES.map((category) => (
              <div key={category.id}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#888888]">
                  {category.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {category.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => appendToPrompt(option)}
                      className="rounded-full border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1 text-xs text-[#F5F5F5] hover:border-[#7C3AED]"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 px-4 pt-3">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm",
                active
                  ? "rounded-lg border-b-2 border-[#7C3AED] bg-[#1F1F1F] text-[#F5F5F5]"
                  : "rounded-t-lg text-[#888888] hover:text-[#F5F5F5]"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-[#8B5CF6]" : "text-[#888888]")} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mx-4 h-px bg-[#2A2A2A]" />

      <form
        className="px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={PLACEHOLDER[activeTab]}
            className="flex-1 bg-transparent text-[15px] text-[#F5F5F5] outline-none placeholder:text-[#666666]"
          />
          <button type="button" className="ml-3 text-[#666666] hover:text-[#F5F5F5]">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {activeTab === "video" && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReferenceTab("start-end")}
                className={cn(
                  "h-11 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] text-sm",
                  referenceTab === "start-end" ? "font-medium text-[#F5F5F5]" : "text-[#888888]"
                )}
              >
                Frame Inicial / Final
              </button>
              <button
                type="button"
                onClick={() => setReferenceTab("omni")}
                className={cn(
                  "h-11 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] text-sm",
                  referenceTab === "omni" ? "font-medium text-[#F5F5F5]" : "text-[#888888]"
                )}
              >
                Omni Reference
              </button>
            </div>

            {referenceTab === "start-end" ? (
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startInputRef.current?.click()}
                  className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
                >
                  {startImageUrl && (
                    <Image src={startImageUrl} alt="Frame inicial" width={18} height={18} className="rounded-sm" unoptimized />
                  )}
                  Frame Inicial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const previousStart = startImageUrl;
                    setStartImageUrl(endImageUrl);
                    setEndImageUrl(previousStart);
                  }}
                  className="text-xs text-[#666666]"
                >
                  ⇄
                </button>
                <button
                  type="button"
                  onClick={() => endInputRef.current?.click()}
                  className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#888888]"
                >
                  {endImageUrl && (
                    <Image src={endImageUrl} alt="Frame final" width={18} height={18} className="rounded-sm" unoptimized />
                  )}
                  Frame Final
                </button>
              </div>
            ) : (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => omniInputRef.current?.click()}
                  className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
                >
                  {referenceImageUrl && (
                    <Image src={referenceImageUrl} alt="Omni Reference" width={18} height={18} className="rounded-sm" unoptimized />
                  )}
                  Omni Reference
                </button>
              </div>
            )}
          </>
        )}

        <input ref={startInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePickFile(event, setStartImageUrl)} />
        <input ref={endInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePickFile(event, setEndImageUrl)} />
        <input ref={omniInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePickFile(event, setReferenceImageUrl)} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Popover
              panelClassName="max-h-80 w-[320px] overflow-y-auto"
              trigger={() => (
                <>
                  <BarChart3 className="h-4 w-4 text-[#8B5CF6]" />
                  <span className="max-w-[150px] truncate">{selectedModel?.name || "Selecionar modelo"}</span>
                  <ChevronUp className="h-3 w-3 text-[#666666]" />
                </>
              )}
            >
              {(close) => (
                <div className="space-y-1">
                  {models.map((model) => {
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
                          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                          active ? "bg-[#2A2A2A] text-[#F5F5F5]" : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                        )}
                      >
                        <span className="truncate">{model.name}</span>
                        {active && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </Popover>

            <Popover
              panelClassName="w-24"
              trigger={() => (
                <>
                  <Smartphone className="h-4 w-4 text-[#888888]" />
                  {safeAspect}
                  <ChevronUp className="h-3 w-3 text-[#666666]" />
                </>
              )}
            >
              {(close) => (
                <div className="space-y-1">
                  {aspectOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setAspectRatio(option);
                        close();
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                        option === safeAspect ? "bg-[#2A2A2A] text-[#F5F5F5]" : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                      )}
                    >
                      <span>{option}</span>
                      {option === safeAspect && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </Popover>

            {activeTab === "video" && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3">
                <span className="h-2 w-2 rounded-full bg-[#7C3AED]" />
                <input
                  type="range"
                  min={4}
                  max={15}
                  step={1}
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="h-1 w-16 accent-[#7C3AED]"
                />
                <span className="text-xs text-[#F5F5F5]">{duration}s</span>
              </div>
            )}

            <Popover
              panelClassName="w-24"
              trigger={() => (
                <>
                  <Expand className="h-4 w-4 text-[#888888]" />
                  {safeResolution}
                  <ChevronUp className="h-3 w-3 text-[#666666]" />
                </>
              )}
            >
              {(close) => (
                <div className="space-y-1">
                  {resolutionOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setResolution(option);
                        close();
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                        option === safeResolution ? "bg-[#2A2A2A] text-[#F5F5F5]" : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                      )}
                    >
                      <span>{option}</span>
                      {option === safeResolution && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </Popover>

            {activeTab === "video" && (
              <button
                type="button"
                onClick={() => setAudioEnabled((value) => !value)}
                className={cn(
                  "h-9 w-9 rounded-lg border text-[#888888]",
                  audioEnabled
                    ? "border-[#7C3AED] bg-[#7C3AED]/15 text-[#F5F5F5]"
                    : "border-[#2A2A2A] bg-[#1A1A1A]"
                )}
              >
                <Volume2 className="mx-auto h-4 w-4" />
              </button>
            )}

            {activeTab === "image" && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 text-sm text-[#F5F5F5]">
                <button type="button" onClick={() => setBatchCount(batchCount - 1)} className="px-1 text-[#888888]">—</button>
                <span className="min-w-4 text-center">{batchCount}</span>
                <button type="button" onClick={() => setBatchCount(batchCount + 1)} className="px-1 text-[#888888]">+</button>
              </div>
            )}

            <button
              type="button"
              onClick={() => toast.info("Mentions em breve.")}
              className="h-9 w-9 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] text-[#888888]"
            >
              <AtSign className="mx-auto h-4 w-4" />
            </button>

            <ControlButton
              active={referenceEnabled}
              onClick={() => setReferenceEnabled((value) => !value)}
              icon={<Upload className="h-4 w-4 text-[#888888]" />}
              muted={!referenceEnabled}
            >
              Referência
            </ControlButton>

            <ControlButton
              active={assistOpen}
              onClick={() => setAssistOpen((value) => !value)}
              icon={<SlidersHorizontal className="h-4 w-4 text-[#888888]" />}
            >
              Assist
              <ChevronUp className="h-3 w-3 text-[#666666]" />
            </ControlButton>

            <ControlButton
              icon={<WandSparkles className="h-4 w-4 text-[#888888]" />}
              muted
              onClick={() => toast.info("Wise Enhance em breve.")}
            >
              Wise Enhance
            </ControlButton>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] px-6 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/30"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Gerar
                <Zap className="h-4 w-4" fill="currentColor" />
                <span>{totalCost}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
