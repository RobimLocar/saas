"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Download,
  Loader2,
  Music,
  Play,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useStudioStore } from "@/stores/use-studio-store";

interface Generation {
  id: string;
  type: "image" | "video" | "audio";
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result_url: string | null;
  error_message: string | null;
  credits_used: number;
  created_at: string;
  params?: { aspect_ratio?: string } | null;
  model_label?: string | null;
  model_slug?: string | null;
}

const POLL_MS = 3000;

export function StudioFeed() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewVideo, setPreviewVideo] = useState<Generation | null>(null);
  const refreshKey = useStudioStore((s) => s.refreshKey);
  const viewFilter = useStudioStore((s) => s.viewFilter);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGenerations = useCallback(async () => {
    try {
      const res = await fetch("/api/generations?limit=80", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setGenerations(data.generations || []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchGenerations();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchGenerations, refreshKey]);

  useEffect(() => {
    const pending = generations.filter(
      (g) => g.status === "pending" || g.status === "processing"
    );

    if (pending.length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      const stillPending = generations.filter(
        (g) => g.status === "pending" || g.status === "processing"
      );

      let anyFinished = false;
      await Promise.all(
        stillPending.map(async (g) => {
          try {
            const res = await fetch(`/api/generate/status?id=${g.id}`, {
              cache: "no-store",
            });
            const data = await res.json();
            if (data.status === "completed" || data.status === "failed") {
              anyFinished = true;
            }
          } catch {
            // segue polling
          }
        })
      );

      if (anyFinished) fetchGenerations();
    }, POLL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generations, fetchGenerations]);

  const filtered = useMemo(
    () =>
      viewFilter === "all"
        ? generations
        : generations.filter((g) => g.type === viewFilter),
    [generations, viewFilter]
  );

  const onDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/generations/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      toast.success("Geração removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-[76px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 pt-[76px] text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Sua galeria está vazia</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Escreva um prompt no painel abaixo e clique em Gerar. Suas criações aparecem aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 px-1 pb-40 pt-[76px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((gen) => (
          <GenerationCard
            key={gen.id}
            gen={gen}
            onDelete={() => onDelete(gen.id)}
            onOpenVideo={() => setPreviewVideo(gen)}
          />
        ))}
      </div>

      {previewVideo?.result_url && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6">
          <button
            type="button"
            onClick={() => setPreviewVideo(null)}
            className="absolute right-6 top-6 rounded-full border border-white/20 bg-black/60 p-2 text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <video
            src={previewVideo.result_url}
            controls
            autoPlay
            className="max-h-[85vh] w-full max-w-4xl rounded-xl border border-white/10 bg-black"
          />
        </div>
      )}
    </>
  );
}

function GenerationCard({
  gen,
  onDelete,
  onOpenVideo,
}: {
  gen: Generation;
  onDelete: () => void;
  onOpenVideo: () => void;
}) {
  const isPending = gen.status === "pending" || gen.status === "processing";
  const isFailed = gen.status === "failed";
  const isDone = gen.status === "completed" && gen.result_url;
  const aspect = gen.params?.aspect_ratio || "1:1";
  const cardAspect = gen.type === "video" ? "aspect-video" : "aspect-square";

  const modelText = gen.model_label || gen.model_slug || "modelo";

  if (isPending) {
    return (
      <article className={cnCard(cardAspect)}>
        <PendingContent type={gen.type} modelText={modelText} aspect={aspect} />
      </article>
    );
  }

  if (isFailed) {
    return (
      <article className={cnCard(cardAspect)}>
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-destructive/10 px-4 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <span className="text-xs text-destructive">Falha na geração</span>
          <span className="text-[10px] text-muted-foreground">Créditos reembolsados</span>
        </div>
      </article>
    );
  }

  if (!isDone) return null;

  if (gen.type === "audio") {
    return (
      <article className="group relative overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Music className="h-4 w-4 text-primary" />
            <span className="truncate">{gen.prompt}</span>
          </div>
          <audio src={gen.result_url!} controls className="w-full" />
        </div>
      </article>
    );
  }

  return (
    <article className={cnCard(cardAspect)}>
      {gen.type === "image" ? (
        <Image
          src={gen.result_url!}
          alt={gen.prompt}
          width={1024}
          height={1024}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <VideoTile src={gen.result_url!} onOpen={onOpenVideo} />
      )}

      <HoverActions url={gen.result_url!} onDelete={onDelete} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-2 text-[11px] text-white/90">{gen.prompt}</p>
      </div>
    </article>
  );
}

function VideoTile({ src, onOpen }: { src: string; onOpen: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function onEnter() {
    if (!videoRef.current) return;
    void videoRef.current.play().catch(() => {
      // silencioso
    });
  }

  function onLeave() {
    if (!videoRef.current) return;
    videoRef.current.pause();
  }

  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onOpen}
      className="relative h-full w-full"
    >
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
      />
      <span className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-white/40 bg-black/40 text-white backdrop-blur-sm">
          <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
        </span>
      </span>
    </button>
  );
}

function PendingContent({
  type,
  modelText,
  aspect,
}: {
  type: Generation["type"];
  modelText: string;
  aspect: string;
}) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        const increment = prev < 60 ? 5 : 2;
        return Math.min(95, prev + increment);
      });
    }, 600);

    return () => clearInterval(timer);
  }, []);

  const label = type === "video" ? "Gerando vídeo..." : type === "image" ? "Gerando imagem..." : "Gerando áudio...";

  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-zinc-950">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-200" />
      <p className="mt-2 text-xs text-zinc-300">{label}</p>

      <div className="absolute inset-x-2 bottom-8 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-500 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="absolute bottom-3 left-2 text-[10px] text-zinc-400">
        {modelText} · {aspect}
      </p>
      <p className="absolute bottom-3 right-2 text-[10px] text-zinc-400">{progress}%</p>
    </div>
  );
}

function HoverActions({
  url,
  onDelete,
}: {
  url: string;
  onDelete: () => void;
}) {
  return (
    <div className="absolute right-2 top-2 z-10 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
      <ActionButton
        onClick={(event) => {
          event.stopPropagation();
          const a = document.createElement("a");
          a.href = url;
          a.download = "geracao";
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.click();
        }}
      >
        <Download className="h-3.5 w-3.5" />
      </ActionButton>

      <ActionButton
        onClick={(event) => {
          event.stopPropagation();
          toast.success("Favorito salvo.");
        }}
      >
        <Star className="h-3.5 w-3.5" />
      </ActionButton>

      <ActionButton
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
    >
      {children}
    </button>
  );
}

function cnCard(aspectClass: string) {
  return `group relative overflow-hidden rounded-xl border border-white/10 bg-card ${aspectClass}`;
}
