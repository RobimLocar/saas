"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Expand,
  ImageIcon,
  Loader2,
  Monitor,
  Music,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
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
  family_description?: string;
  badge?: string;
  has_audio?: boolean;
  resolution?: string;
  duration_range?: string;
  dur_min?: number;
  dur_max?: number;
}

interface UserAsset {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

const TABS: { id: Modality; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Music },
];

const PLACEHOLDER: Record<Modality, string> = {
  image: "Describe the image you want to create...",
  video: "Describe the video you want to create...",
  audio: "Describe the audio you want to create...",
};

const ASPECT_RATIOS: Record<"image" | "video", string[]> = {
  image: ["1:1", "3:4", "9:16", "4:3", "3:2", "16:9"],
  video: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9"],
};

const RESOLUTIONS: Record<"image" | "video", string[]> = {
  image: ["1K", "2K", "4K"],
  video: ["480p", "720p", "1080p"],
};

const ASSET_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "characters", label: "Characters" },
  { id: "scenes", label: "Scenes" },
  { id: "products", label: "Products" },
  { id: "custom", label: "Custom" },
];

/** Ícone de proporção — retângulo com a orientação do aspect ratio. */
function RatioIcon({ ratio, className }: { ratio: string; className?: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const max = 13;
  let width = max;
  let height = max;
  if (w > h) {
    height = Math.max(6, Math.round((h / w) * max));
  } else if (h > w) {
    width = Math.max(6, Math.round((w / h) * max));
  }
  return (
    <span className={cn("flex h-4 w-4 items-center justify-center", className)}>
      <span
        style={{ width, height }}
        className="rounded-[2px] border-[1.5px] border-current"
      />
    </span>
  );
}

function Popover({
  trigger,
  children,
  panelClassName,
  triggerClassName,
  onOpenChange,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  panelClassName?: string;
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    }

    function onEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        onOpenChange?.(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            onOpenChange?.(!v);
            return !v;
          });
        }}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-sm text-[#F5F5F5]",
          triggerClassName
        )}
      >
        {trigger(open)}
      </button>

      {open && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-1 shadow-2xl",
            panelClassName
          )}
        >
          {children(() => {
            setOpen(false);
            onOpenChange?.(false);
          })}
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

/** Pill de spec exibido no submenu de variantes (resolução / duração). */
function SpecPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-md border border-[#2A2A2A] bg-[#1F1F1F] px-1.5 py-0.5 text-[10px] text-[#888888]">
      {icon}
      {label}
    </span>
  );
}

interface FamilyGroup {
  family: string;
  description: string;
  models: ApiModel[];
}

/** Menu hierárquico de modelos: famílias à esquerda, variantes em flyout à direita. */
function ModelMenu({
  groups,
  selectedId,
  onSelect,
}: {
  groups: FamilyGroup[];
  selectedId: string;
  onSelect: (model: ApiModel) => void;
}) {
  const [openFamily, setOpenFamily] = useState<string | null>(() => {
    const g = groups.find((item) =>
      item.models.some((m) => m.id === selectedId)
    );
    return g?.family ?? groups[0]?.family ?? null;
  });

  return (
    <div className="w-[340px] p-1">
      {groups.map((group) => {
        const isOpen = openFamily === group.family;
        const hasSelected = group.models.some((m) => m.id === selectedId);
        return (
          <div
            key={group.family}
            className="relative"
            onMouseEnter={() => setOpenFamily(group.family)}
          >
            <button
              type="button"
              onClick={() => setOpenFamily(group.family)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                isOpen ? "bg-[#1F1F1F]" : "hover:bg-[#1F1F1F]"
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2A2A2A] text-sm font-semibold text-[#F5F5F5]">
                {group.family.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    hasSelected ? "font-medium text-[#F5F5F5]" : "text-[#F5F5F5]"
                  )}
                >
                  {group.family}
                </span>
                <span className="block truncate text-xs text-[#888888]">
                  {group.description}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#666666]" />
            </button>

            {isOpen && (
              <div className="absolute bottom-0 left-full z-50 ml-1.5 w-[290px] rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-1.5 shadow-2xl">
                {group.models.map((model) => {
                  const selected = model.id === selectedId;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => onSelect(model)}
                      className={cn(
                        "block w-full rounded-lg px-2.5 py-2 text-left",
                        selected ? "bg-[#1F1F1F]" : "hover:bg-[#1F1F1F]"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-[#F5F5F5]">
                          {model.name}
                        </span>
                        {model.has_audio && (
                          <Volume2 className="h-3 w-3 shrink-0 text-[#888888]" />
                        )}
                        {model.badge && (
                          <span className="shrink-0 text-[9px] font-semibold tracking-wider text-[#888888]">
                            {model.badge}
                          </span>
                        )}
                        {selected && (
                          <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#F5F5F5]" />
                        )}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        {model.resolution && (
                          <SpecPill
                            icon={<Monitor className="h-2.5 w-2.5" />}
                            label={model.resolution}
                          />
                        )}
                        {model.duration_range && (
                          <SpecPill
                            icon={<Clock className="h-2.5 w-2.5" />}
                            label={model.duration_range}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GenerationDock() {
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const prompt = useStudioStore((s) => s.prompt);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const selectedModelId = useStudioStore((s) => s.selectedModelId);
  const setSelectedModelId = useStudioStore((s) => s.setSelectedModelId);
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
  const startImageUrl = useStudioStore((s) => s.startImageUrl);
  const setStartImageUrl = useStudioStore((s) => s.setStartImageUrl);
  const endImageUrl = useStudioStore((s) => s.endImageUrl);
  const setEndImageUrl = useStudioStore((s) => s.setEndImageUrl);
  const referenceImages = useStudioStore((s) => s.referenceImages);
  const addReferenceImage = useStudioStore((s) => s.addReferenceImage);
  const removeReferenceImage = useStudioStore((s) => s.removeReferenceImage);
  const referenceVideos = useStudioStore((s) => s.referenceVideos);
  const addReferenceVideo = useStudioStore((s) => s.addReferenceVideo);
  const removeReferenceVideo = useStudioStore((s) => s.removeReferenceVideo);
  const referenceAudios = useStudioStore((s) => s.referenceAudios);
  const addReferenceAudio = useStudioStore((s) => s.addReferenceAudio);
  const removeReferenceAudio = useStudioStore((s) => s.removeReferenceAudio);
  const triggerRefresh = useStudioStore((s) => s.triggerRefresh);
  const setViewFilter = useStudioStore((s) => s.setViewFilter);

  const [models, setModels] = useState<ApiModel[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistCategory, setAssistCategory] = useState(
    ASSIST_CATEGORIES[0]?.id ?? "subject"
  );
  const [atOpen, setAtOpen] = useState(false);
  const [assetCategory, setAssetCategory] = useState("all");
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [refSectionOpen, setRefSectionOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [loading, setLoading] = useState(false);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const refVideoInputRef = useRef<HTMLInputElement>(null);
  const refAudioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const loadCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.credits === "number") setCredits(data.credits);
    } catch {
      // silencioso
    }
  }, []);

  const loadAssets = useCallback(async (category: string) => {
    setAssetsLoading(true);
    try {
      const res = await fetch(`/api/assets?category=${category}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setAssets(data.assets || []);
    } catch {
      // silencioso
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadModels(activeTab);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadModels]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCredits();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadCredits]);

  useEffect(() => {
    if (!atOpen) return;
    const timer = setTimeout(() => {
      void loadAssets(assetCategory);
    }, 0);
    return () => clearTimeout(timer);
  }, [atOpen, assetCategory, loadAssets]);

  useEffect(() => {
    if (!models.length) return;
    const exists = models.some((item) => item.id === selectedModelId);
    if (!exists) setSelectedModelId(models[0].id);
  }, [models, selectedModelId, setSelectedModelId]);

  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );

  const familyGroups = useMemo<FamilyGroup[]>(() => {
    const groups: FamilyGroup[] = [];
    for (const model of models) {
      const family = model.family || model.name;
      let group = groups.find((g) => g.family === family);
      if (!group) {
        group = {
          family,
          description: model.family_description || "",
          models: [],
        };
        groups.push(group);
      }
      if (!group.description && model.family_description) {
        group.description = model.family_description;
      }
      group.models.push(model);
    }
    return groups;
  }, [models]);

  const aspectOptions =
    activeTab === "video" ? ASPECT_RATIOS.video : ASPECT_RATIOS.image;
  const resolutionOptions =
    activeTab === "video" ? RESOLUTIONS.video : RESOLUTIONS.image;
  const safeAspect = aspectOptions.includes(aspectRatio)
    ? aspectRatio
    : aspectOptions[0];
  const safeResolution = resolutionOptions.includes(resolution)
    ? resolution
    : resolutionOptions[0];
  const creditCost = selectedModel?.credit_cost ?? 1;
  const totalCost = activeTab === "image" ? creditCost * batchCount : creditCost;
  const insufficient = credits !== null && credits < totalCost;

  const durMin = selectedModel?.dur_min ?? 4;
  const durMax = selectedModel?.dur_max ?? 15;
  const safeDuration = Math.min(Math.max(duration, durMin), durMax);
  const totalRefs =
    referenceImages.length + referenceVideos.length + referenceAudios.length;

  function selectModel(model: ApiModel) {
    setSelectedModelId(model.id);
    const min = model.dur_min ?? 4;
    const max = model.dur_max ?? 15;
    if (duration < min) setDuration(min);
    if (duration > max) setDuration(max);
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

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
      toast.error("Não foi possível ler o arquivo.");
    } finally {
      event.target.value = "";
    }
  }

  async function handlePickToList(
    event: ChangeEvent<HTMLInputElement>,
    add: (value: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await toDataUrl(file);
      add(dataUrl);
      toast.success("Referência adicionada.");
    } catch {
      toast.error("Não foi possível ler o arquivo.");
    } finally {
      event.target.value = "";
    }
  }

  function appendToPrompt(snippet: string) {
    const cleaned = prompt.trim();
    setPrompt(cleaned ? `${cleaned}, ${snippet}` : snippet);
  }

  async function handleWiseEnhance() {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para melhorar.");
      return;
    }
    if (enhancing) return;

    setEnhancing(true);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modality: activeTab }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao melhorar o prompt.");
      }
      setPrompt(data.prompt);
      toast.success("Prompt aprimorado pelo Wise.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao melhorar o prompt."
      );
    } finally {
      setEnhancing(false);
    }
  }

  async function submitSingleGeneration() {
    const body: Record<string, unknown> = {
      prompt,
      model_uuid: selectedModelId,
    };

    if (activeTab !== "audio") {
      body.aspect_ratio = safeAspect;
    }

    if (activeTab === "image") {
      body.resolution = safeResolution;
      const ref = referenceImages[0] || referenceImageUrl;
      if (ref) {
        body.reference_image_url = ref;
      }
    }

    if (activeTab === "video") {
      body.duration = safeDuration;
      body.resolution = safeResolution;
      if (referenceTab === "omni") {
        const ref = referenceImages[0] || referenceImageUrl;
        if (ref) body.start_image_url = ref;
      }
      if (referenceTab === "start-end") {
        if (startImageUrl) body.start_image_url = startImageUrl;
        if (endImageUrl) body.end_image_url = endImageUrl;
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

    if (insufficient) {
      toast.error(`Need ${totalCost} credits. ${credits ?? 0} available.`);
      return;
    }

    setLoading(true);
    try {
      if (activeTab === "image" && batchCount > 1) {
        const jobs = Array.from({ length: batchCount }).map(() =>
          submitSingleGeneration()
        );
        const results = await Promise.allSettled(jobs);
        const successCount = results.filter(
          (item) => item.status === "fulfilled"
        ).length;

        if (!successCount) throw new Error("Nenhuma geração foi enviada.");

        toast.success(`${successCount} gerações enviadas.`);
      } else {
        await submitSingleGeneration();
        toast.success("Geração enviada! Acompanhe no feed.");
      }

      setPrompt("");
      setViewFilter("all");
      triggerRefresh();
      void loadCredits();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível gerar."
      );
    } finally {
      setLoading(false);
    }
  }

  const activeAssistCategory =
    ASSIST_CATEGORIES.find((c) => c.id === assistCategory) ??
    ASSIST_CATEGORIES[0];
  const activeAssetCategory =
    ASSET_CATEGORIES.find((c) => c.id === assetCategory) ?? ASSET_CATEGORIES[0];

  const showReferenceSections =
    (activeTab === "video" && referenceTab === "omni") ||
    (activeTab === "image" && refSectionOpen);

  return (
    <section className="fixed bottom-4 left-1/2 z-30 w-[min(1180px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-[#2A2A2A] bg-[#141414]/95 shadow-2xl backdrop-blur">
      {/* Painel Assist — duas colunas */}
      {assistOpen && (
        <div className="border-b border-[#2A2A2A]">
          <div className="grid grid-cols-[210px_1fr]">
            <div className="max-h-[300px] overflow-y-auto border-r border-[#2A2A2A] p-3">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                Categories
              </p>
              {ASSIST_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setAssistCategory(category.id)}
                  className={cn(
                    "block w-full rounded-lg px-2.5 py-1.5 text-left text-sm",
                    category.id === assistCategory
                      ? "bg-[#2A2A2A] text-[#F5F5F5]"
                      : "text-[#888888] hover:bg-[#1F1F1F] hover:text-[#F5F5F5]"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="max-h-[300px] overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                  {activeAssistCategory.label} · Click to add
                </p>
                <button
                  type="button"
                  onClick={() => setAssistOpen(false)}
                  className="text-[#666666] hover:text-[#F5F5F5]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeAssistCategory.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => appendToPrompt(option)}
                    className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-xs text-[#F5F5F5] hover:border-[#7C3AED]"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Painel @ (assets) — duas colunas */}
      {atOpen && (
        <div className="border-b border-[#2A2A2A]">
          <div className="grid grid-cols-[210px_1fr]">
            <div className="max-h-[300px] overflow-y-auto border-r border-[#2A2A2A] p-3">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                Categories
              </p>
              {ASSET_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setAssetCategory(category.id)}
                  className={cn(
                    "block w-full rounded-lg px-2.5 py-1.5 text-left text-sm",
                    category.id === assetCategory
                      ? "bg-[#2A2A2A] text-[#F5F5F5]"
                      : "text-[#888888] hover:bg-[#1F1F1F] hover:text-[#F5F5F5]"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="max-h-[300px] overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                  {activeAssetCategory.label} · Click to add
                </p>
                <button
                  type="button"
                  onClick={() => setAtOpen(false)}
                  className="text-[#666666] hover:text-[#F5F5F5]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {assetsLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-[#666666]" />
                </div>
              ) : assets.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-[#666666]">
                  No assets found
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        addReferenceImage(asset.image_url);
                        toast.success(`"${asset.name}" adicionado às referências.`);
                      }}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A]"
                      title={asset.name}
                    >
                      <Image
                        src={asset.image_url}
                        alt={asset.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-[#F5F5F5] opacity-0 group-hover:opacity-100">
                        {asset.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Image | Video | Audio */}
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
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-[#8B5CF6]" : "text-[#888888]"
                )}
              />
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
        {/* Prompt multiline + contador + colapsar */}
        <div className="mb-2 flex items-start justify-between gap-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            maxLength={8000}
            rows={1}
            onChange={(event) => {
              setPrompt(event.target.value);
              autoResize();
            }}
            onInput={autoResize}
            placeholder={PLACEHOLDER[activeTab]}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-[15px] leading-6 text-[#F5F5F5] outline-none placeholder:text-[#666666]"
          />
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <span className="text-[11px] text-[#666666]">
              {prompt.length}/8000
            </span>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              title={collapsed ? "Expandir controles" : "Recolher controles"}
              className="text-[#666666] hover:text-[#F5F5F5]"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  collapsed && "rotate-180"
                )}
              />
            </button>
          </div>
        </div>

        {/* Segmentada Start/End Frame | Omni Reference (vídeo) */}
        {!collapsed && activeTab === "video" && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-1">
            <button
              type="button"
              onClick={() => setReferenceTab("start-end")}
              className={cn(
                "h-10 rounded-lg text-sm",
                referenceTab === "start-end"
                  ? "bg-[#2A2A2A] font-medium text-[#F5F5F5]"
                  : "text-[#888888] hover:text-[#F5F5F5]"
              )}
            >
              Start / End Frame
            </button>
            <button
              type="button"
              onClick={() => setReferenceTab("omni")}
              className={cn(
                "h-10 rounded-lg text-sm",
                referenceTab === "omni"
                  ? "bg-[#2A2A2A] font-medium text-[#F5F5F5]"
                  : "text-[#888888] hover:text-[#F5F5F5]"
              )}
            >
              Omni Reference
            </button>
          </div>
        )}

        {/* Start / End Frame */}
        {!collapsed && activeTab === "video" && referenceTab === "start-end" && (
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => startInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
            >
              {startImageUrl && (
                <Image
                  src={startImageUrl}
                  alt="Start frame"
                  width={18}
                  height={18}
                  className="rounded-sm"
                  unoptimized
                />
              )}
              Start Frame
            </button>
            <button
              type="button"
              onClick={() => {
                const previousStart = startImageUrl;
                setStartImageUrl(endImageUrl);
                setEndImageUrl(previousStart);
              }}
              className="text-xs text-[#666666]"
              title="Swap frames"
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={() => endInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#888888]"
            >
              {endImageUrl && (
                <Image
                  src={endImageUrl}
                  alt="End frame"
                  width={18}
                  height={18}
                  className="rounded-sm"
                  unoptimized
                />
              )}
              End Frame
            </button>
          </div>
        )}

        {/* Seções de referência (Omni / Reference imagem) */}
        {!collapsed && showReferenceSections && (
          <div className="mb-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                  Reference Images ({referenceImages.length}/9)
                </p>
                {activeTab === "video" && (
                  <p className="text-[10px] text-[#666666]">
                    {totalRefs}/12 total
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {referenceImages.map((url, index) => (
                  <div key={`${url.slice(0, 32)}-${index}`} className="relative">
                    <Image
                      src={url}
                      alt={`Reference ${index + 1}`}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-lg border border-[#2A2A2A] object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => removeReferenceImage(index)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#2A2A2A] text-[#F5F5F5] hover:bg-[#7C3AED]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {referenceImages.length < 9 && (
                  <button
                    type="button"
                    onClick={() => refImageInputRef.current?.click()}
                    className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] text-[#666666] hover:border-[#7C3AED] hover:text-[#F5F5F5]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {activeTab === "video" && (
              <>
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                    Reference Videos ({referenceVideos.length}/3)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {referenceVideos.map((url, index) => (
                      <div
                        key={`vid-${index}`}
                        className="relative flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
                      >
                        <Video className="h-3.5 w-3.5 text-[#888888]" />
                        Video {index + 1}
                        <button
                          type="button"
                          onClick={() => removeReferenceVideo(index)}
                          className="text-[#666666] hover:text-[#F5F5F5]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {referenceVideos.length < 3 && (
                      <button
                        type="button"
                        onClick={() => refVideoInputRef.current?.click()}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#888888] hover:border-[#7C3AED] hover:text-[#F5F5F5]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Import Video
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                    Reference Audio ({referenceAudios.length}/3)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {referenceAudios.map((url, index) => (
                      <div
                        key={`aud-${index}`}
                        className="relative flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
                      >
                        <Music className="h-3.5 w-3.5 text-[#888888]" />
                        Audio {index + 1}
                        <button
                          type="button"
                          onClick={() => removeReferenceAudio(index)}
                          className="text-[#666666] hover:text-[#F5F5F5]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {referenceAudios.length < 3 && (
                      <button
                        type="button"
                        onClick={() => refAudioInputRef.current?.click()}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#888888] hover:border-[#7C3AED] hover:text-[#F5F5F5]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Import Audio
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Inputs de arquivo ocultos */}
        <input
          ref={startInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickFile(event, setStartImageUrl)}
        />
        <input
          ref={endInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickFile(event, setEndImageUrl)}
        />
        <input
          ref={refImageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickToList(event, addReferenceImage)}
        />
        <input
          ref={refVideoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => void handlePickToList(event, addReferenceVideo)}
        />
        <input
          ref={refAudioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => void handlePickToList(event, addReferenceAudio)}
        />

        {/* Toolbar */}
        <div className={cn("flex flex-wrap items-center justify-between gap-y-2", collapsed && "hidden")}>
          <div className="flex flex-wrap items-center gap-2">
            {/* Modelo — menu hierárquico */}
            <Popover
              panelClassName="overflow-visible"
              trigger={() => (
                <>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-[#2A2A2A] text-[10px] font-semibold text-[#F5F5F5]">
                    {(selectedModel?.family || selectedModel?.name || "M").charAt(0)}
                  </span>
                  <span className="max-w-[170px] truncate">
                    {selectedModel?.name || "Select model"}
                  </span>
                  <ChevronUp className="h-3 w-3 text-[#666666]" />
                </>
              )}
            >
              {(close) => (
                <ModelMenu
                  groups={familyGroups}
                  selectedId={selectedModelId}
                  onSelect={(model) => {
                    selectModel(model);
                    close();
                  }}
                />
              )}
            </Popover>

            {/* Aspect ratio */}
            {activeTab !== "audio" && (
              <Popover
                panelClassName="w-32"
                trigger={() => (
                  <>
                    <RatioIcon ratio={safeAspect} className="text-[#888888]" />
                    {safeAspect}
                    <ChevronUp className="h-3 w-3 text-[#666666]" />
                  </>
                )}
              >
                {(close) => (
                  <div className="space-y-0.5">
                    {aspectOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setAspectRatio(option);
                          close();
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                          option === safeAspect
                            ? "bg-[#2A2A2A] text-[#F5F5F5]"
                            : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                        )}
                      >
                        <RatioIcon ratio={option} />
                        <span className="flex-1 text-left">{option}</span>
                        {option === safeAspect && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}

            {/* Duração (vídeo) */}
            {activeTab === "video" && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3">
                <input
                  type="range"
                  min={durMin}
                  max={durMax}
                  step={1}
                  value={safeDuration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="h-1 w-16 accent-[#7C3AED]"
                />
                <span className="text-xs text-[#F5F5F5]">{safeDuration}s</span>
              </div>
            )}

            {/* Resolução */}
            {activeTab !== "audio" && (
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
                  <div className="space-y-0.5">
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
                          option === safeResolution
                            ? "bg-[#2A2A2A] text-[#F5F5F5]"
                            : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                        )}
                      >
                        <span>{option}</span>
                        {option === safeResolution && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}

            {/* Áudio on/off (vídeo) */}
            {activeTab === "video" && (
              <button
                type="button"
                onClick={() => {
                  const next = !audioEnabled;
                  setAudioEnabled(next);
                  toast.info(
                    next ? "Áudio do vídeo ativado." : "Áudio do vídeo desativado."
                  );
                }}
                title={
                  audioEnabled
                    ? "Áudio ativado — clique para desativar"
                    : "Áudio desativado — clique para ativar"
                }
                className={cn(
                  "h-9 w-9 rounded-lg border",
                  audioEnabled
                    ? "border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                    : "border-[#2A2A2A] bg-[#1A1A1A] text-[#666666]"
                )}
              >
                {audioEnabled ? (
                  <Volume2 className="mx-auto h-4 w-4" />
                ) : (
                  <VolumeX className="mx-auto h-4 w-4" />
                )}
              </button>
            )}

            {/* Batch (imagem) */}
            {activeTab === "image" && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 text-sm text-[#F5F5F5]">
                <button
                  type="button"
                  onClick={() => setBatchCount(batchCount - 1)}
                  className="px-1 text-[#888888]"
                >
                  —
                </button>
                <span className="min-w-4 text-center">{batchCount}</span>
                <button
                  type="button"
                  onClick={() => setBatchCount(batchCount + 1)}
                  className="px-1 text-[#888888]"
                >
                  +
                </button>
              </div>
            )}

            {/* @ — assets */}
            <button
              type="button"
              onClick={() => {
                setAtOpen((value) => !value);
                setAssistOpen(false);
              }}
              className={cn(
                "h-9 w-9 rounded-lg border",
                atOpen
                  ? "border-[#7C3AED] bg-[#7C3AED]/15 text-[#F5F5F5]"
                  : "border-[#2A2A2A] bg-[#1A1A1A] text-[#888888]"
              )}
            >
              <AtSign className="mx-auto h-4 w-4" />
            </button>

            {/* Reference */}
            <ControlButton
              active={
                activeTab === "video"
                  ? referenceTab === "omni"
                  : refSectionOpen || referenceImages.length > 0
              }
              onClick={() => {
                if (activeTab === "video") {
                  setReferenceTab(referenceTab === "omni" ? "start-end" : "omni");
                } else {
                  setRefSectionOpen((value) => !value);
                }
              }}
              icon={<Upload className="h-4 w-4 text-[#888888]" />}
              muted
            >
              Reference
            </ControlButton>

            {/* Assist */}
            <ControlButton
              active={assistOpen}
              onClick={() => {
                setAssistOpen((value) => !value);
                setAtOpen(false);
              }}
              icon={<SlidersHorizontal className="h-4 w-4 text-[#888888]" />}
            >
              Assist
              <ChevronUp className="h-3 w-3 text-[#666666]" />
            </ControlButton>

            {/* Wise enhance */}
            <ControlButton
              icon={
                enhancing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#8B5CF6]" />
                ) : (
                  <Sparkles className="h-4 w-4 text-[#888888]" />
                )
              }
              muted={!enhancing}
              onClick={() => void handleWiseEnhance()}
            >
              Wise enhance
            </ControlButton>
          </div>

          {/* Generate */}
          <div className="flex flex-col items-end">
            <button
              type="submit"
              disabled={loading || insufficient}
              className={cn(
                "flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold",
                insufficient
                  ? "cursor-not-allowed bg-[#D4D4D4] text-[#141414]"
                  : "bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] text-white shadow-lg shadow-[#7C3AED]/30"
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Generate
                  <Zap className="h-4 w-4" fill="currentColor" />
                  <span>{totalCost}</span>
                </>
              )}
            </button>
            {insufficient && (
              <span className="mt-1 text-[11px] text-[#888888]">
                Need {totalCost} credits. {credits ?? 0} available.
              </span>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
