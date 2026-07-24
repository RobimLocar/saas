"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Heart,
  ImagePlus,
  Music,
  Play,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/stores/use-studio-store";

export interface LightboxItem {
  id: string;
  type: "image" | "video" | "audio";
  prompt: string;
  status: string;
  result_url: string | null;
  created_at: string;
  credits_used: number;
  model_uuid?: string | null;
  model_label?: string | null;
  model_slug?: string | null;
  params?: {
    aspect_ratio?: string;
    resolution?: string;
    duration?: number;
    is_favorite?: boolean;
    prompt_favorite?: boolean;
    reference_image_url?: string;
    start_image_url?: string;
  } | null;
}

/** Tempo relativo em inglês, igual ao design ("5 days ago"). */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
}

function typeLabel(type: LightboxItem["type"]): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#2A2A2A] px-4 py-3 last:border-b-0">
      <span className="text-sm text-[#888888]">{label}</span>
      <span className="text-sm text-[#F5F5F5]">{value}</span>
    </div>
  );
}

export function MediaLightbox({
  items,
  index,
  onClose,
  onNavigate,
  onDeleted,
  onUpdated,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDeleted: (id: string) => void;
  onUpdated: (id: string, params: NonNullable<LightboxItem["params"]>) => void;
}) {
  const item = items[index];
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const setSelectedModelId = useStudioStore((s) => s.setSelectedModelId);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const setDuration = useStudioStore((s) => s.setDuration);
  const setResolution = useStudioStore((s) => s.setResolution);
  const setReferenceImageUrl = useStudioStore((s) => s.setReferenceImageUrl);
  const setStartImageUrl = useStudioStore((s) => s.setStartImageUrl);
  const setReferenceTab = useStudioStore((s) => s.setReferenceTab);

  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemId = item?.id;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [itemId]);

  const goPrev = useCallback(() => {
    if (items.length < 2) return;
    onNavigate((index - 1 + items.length) % items.length);
  }, [index, items.length, onNavigate]);

  const goNext = useCallback(() => {
    if (items.length < 2) return;
    onNavigate((index + 1) % items.length);
  }, [index, items.length, onNavigate]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, goPrev, goNext]);

  if (!item) return null;

  const isFavorite = Boolean(item.params?.is_favorite);
  const isPromptFavorite = Boolean(item.params?.prompt_favorite);
  const referenceThumb =
    item.params?.reference_image_url || item.params?.start_image_url || null;

  async function patchFlags(patch: {
    is_favorite?: boolean;
    prompt_favorite?: boolean;
  }) {
    const res = await fetch(`/api/generations/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Falha ao atualizar");
    onUpdated(item.id, data.params || {});
  }

  async function handleFavorite() {
    if (busy) return;
    setBusy(true);
    try {
      await patchFlags({ is_favorite: !isFavorite });
      toast.success(
        isFavorite ? "Removido dos favoritos." : "Adicionado aos favoritos."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao favoritar.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePromptFavorite() {
    if (busy) return;
    setBusy(true);
    try {
      await patchFlags({ prompt_favorite: !isPromptFavorite });
      toast.success(
        isPromptFavorite
          ? "Prompt removido dos favoritos."
          : "Prompt salvo em My Prompts."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao salvar prompt."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      toast.success("Geração excluída.");
      onDeleted(item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!item.result_url) return;
    const link = document.createElement("a");
    link.href = item.result_url;
    link.download = `fluxyra-${item.type}-${item.id.slice(0, 8)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }

  function handleRecreate() {
    setActiveTab(item.type);
    setPrompt(item.prompt);
    if (item.model_uuid) setSelectedModelId(item.model_uuid);
    if (item.params?.aspect_ratio) setAspectRatio(item.params.aspect_ratio);
    if (item.params?.resolution) setResolution(item.params.resolution);
    if (typeof item.params?.duration === "number") {
      setDuration(item.params.duration);
    }
    onClose();
    toast.success("Parâmetros carregados no painel de geração.");
  }

  function handleUseAsReference() {
    if (!item.result_url) return;
    setReferenceImageUrl(item.result_url);
    setActiveTab("image");
    onClose();
    toast.success("Imagem definida como referência.");
  }

  function handleCreateVideo() {
    if (!item.result_url) return;
    setActiveTab("video");
    setReferenceTab("start-end");
    setStartImageUrl(item.result_url);
    onClose();
    toast.success("Imagem carregada como quadro inicial do vídeo.");
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(item.prompt);
      toast.success("Prompt copiado.");
    } catch {
      toast.error("Não foi possível copiar o prompt.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl"
      onClick={onClose}
    >
      {/* Área central da mídia */}
      <div
        className="absolute inset-y-0 left-0 right-[320px] flex flex-col items-center justify-center px-16"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex max-h-[82vh] items-center justify-center overflow-hidden rounded-xl">
          {item.type === "image" && item.result_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.result_url}
              alt={item.prompt}
              className="max-h-[82vh] max-w-full rounded-xl object-contain"
            />
          )}
          {item.type === "video" && item.result_url && (
            <video
              key={item.id}
              src={item.result_url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[82vh] max-w-full rounded-xl"
            />
          )}
          {item.type === "audio" && item.result_url && (
            <div className="flex w-[420px] flex-col items-center gap-4 rounded-xl bg-[#1A1A1A] p-8">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2A2A2A]">
                <Music className="h-7 w-7 text-[#8B5CF6]" />
              </span>
              <audio key={item.id} src={item.result_url} controls autoPlay className="w-full" />
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-[#888888]">
          {index + 1} / {items.length}
        </p>
      </div>

      {/* Setas de navegação */}
      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            className="absolute left-6 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-[#F5F5F5] backdrop-blur transition hover:bg-black/60"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            className="absolute right-[340px] top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-[#F5F5F5] backdrop-blur transition hover:bg-black/60"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Painel lateral direito */}
      <aside
        className="absolute bottom-3 right-3 top-3 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-xs text-[#888888]">
            {typeLabel(item.type)} · {relativeTime(item.created_at)}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleDelete()}
              title="Delete"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#888888] hover:bg-[#2A2A2A] hover:text-[#F5F5F5]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleFavorite()}
              title="Favorite"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#2A2A2A]",
                isFavorite ? "text-[#EF4444]" : "text-[#888888] hover:text-[#F5F5F5]"
              )}
            >
              <Heart className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#888888] hover:bg-[#2A2A2A] hover:text-[#F5F5F5]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Conteúdo scrollável */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-5">
          <h3 className="mt-3 text-base font-semibold text-[#F5F5F5]">Prompt</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#B5B5B5]">
            {item.prompt}
          </p>

          {referenceThumb && (
            <div className="mt-3">
              <Image
                src={referenceThumb}
                alt="Reference"
                width={40}
                height={40}
                className="h-10 w-10 rounded-md border border-[#2A2A2A] object-cover"
                unoptimized
              />
            </div>
          )}

          {/* Settings */}
          <div className="mt-5 overflow-hidden rounded-xl border border-[#2A2A2A]">
            <div className="border-b border-[#2A2A2A] px-4 py-3">
              <p className="text-sm font-semibold text-[#F5F5F5]">Settings</p>
            </div>
            {item.model_label && <SettingRow label="Model" value={item.model_label} />}
            <SettingRow label="Type" value={typeLabel(item.type)} />
            {item.params?.resolution && (
              <SettingRow label="Resolution" value={item.params.resolution} />
            )}
            {item.params?.aspect_ratio && (
              <SettingRow label="Aspect Ratio" value={item.params.aspect_ratio} />
            )}
            {typeof item.params?.duration === "number" && (
              <SettingRow label="Duration" value={`${item.params.duration}s`} />
            )}
          </div>

          {/* Ações */}
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-[#141414] transition hover:bg-[#E5E5E5]"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            {item.type === "image" && (
              <button
                type="button"
                onClick={handleUseAsReference}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#2A2A2A] bg-[#1F1F1F] text-sm text-[#F5F5F5] transition hover:bg-[#2A2A2A]"
              >
                <ImagePlus className="h-4 w-4" />
                Use as Reference
              </button>
            )}
            {item.type !== "image" && (
              <button
                type="button"
                disabled
                title="Em breve"
                className="flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-[#2A2A2A] bg-[#1F1F1F] text-sm text-[#666666]"
              >
                <Music className="h-4 w-4" />
                Lip Sync
              </button>
            )}
            <button
              type="button"
              onClick={handleRecreate}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#2A2A2A] bg-[#1F1F1F] text-sm text-[#F5F5F5] transition hover:bg-[#2A2A2A]"
            >
              <Play className="h-4 w-4" />
              Recreate
            </button>
            {item.type === "image" && (
              <button
                type="button"
                onClick={handleCreateVideo}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#2A2A2A] bg-[#1F1F1F] text-sm text-[#F5F5F5] transition hover:bg-[#2A2A2A]"
              >
                <Clapperboard className="h-4 w-4" />
                Create Video
              </button>
            )}
            <button
              type="button"
              onClick={() => void handlePromptFavorite()}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-full border bg-[#1F1F1F] text-sm text-[#F5F5F5] transition hover:bg-[#2A2A2A]",
                isPromptFavorite ? "border-[#D97706]" : "border-[#92400E]/60"
              )}
            >
              <Star
                className="h-4 w-4"
                fill={isPromptFavorite ? "#D97706" : "none"}
              />
              Add to Prompt Favorite
            </button>
            <button
              type="button"
              onClick={() => void handleCopyPrompt()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#2A2A2A] bg-[#1F1F1F] text-sm text-[#F5F5F5] transition hover:bg-[#2A2A2A]"
            >
              <Copy className="h-4 w-4" />
              Copy Prompt
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
