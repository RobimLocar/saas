"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { Download, Heart, Loader2, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useStudioStore } from "@/stores/use-studio-store";
import { MediaLightbox, type LightboxItem } from "@/components/studio/media-lightbox";

interface Generation {
  id: string;
  type: "image" | "video" | "audio";
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result_url: string | null;
  error_message: string | null;
  credits_used: number;
  created_at: string;
  model_uuid?: string | null;
  params?: LightboxItem["params"];
  model_label?: string | null;
  model_slug?: string | null;
}

const POLL_MS = 3000;

/**
 * Calcula o aspect-ratio de cada card via style inline (evita purge do Tailwind).
 * Áudio usa altura fixa; vídeo/imagem usam aspect_ratio do params ou padrão.
 */
function aspectStyle(gen: Generation): React.CSSProperties {
  if (gen.type === "audio") return { height: "80px" };
  const ar = gen.params?.aspect_ratio;
  if (!ar) return { aspectRatio: gen.type === "video" ? "16/9" : "1/1" };
  const [w, h] = ar.split(":").map(Number);
  if (!w || !h) return { aspectRatio: "1/1" };
  return { aspectRatio: `${w}/${h}` };
}

export function StudioFeed() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
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
    const pending = generations.some(
      (item) => item.status === "pending" || item.status === "processing"
    );

    if (!pending) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    if (pollRef.current) return;

    pollRef.current = setInterval(async () => {
      const onQueue = generations.filter(
        (item) => item.status === "pending" || item.status === "processing"
      );

      let changed = false;
      await Promise.all(
        onQueue.map(async (item) => {
          try {
            const res = await fetch(`/api/generate/status?id=${item.id}`, { cache: "no-store" });
            const data = await res.json();
            if (data.status === "completed" || data.status === "failed") changed = true;
          } catch {
            // segue polling
          }
        })
      );

      if (changed) void fetchGenerations();
    }, POLL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generations, fetchGenerations]);

  const filtered = useMemo(
    () => (viewFilter === "all" ? generations : generations.filter((item) => item.type === viewFilter)),
    [generations, viewFilter]
  );

  const lightboxItems = useMemo(
    () => filtered.filter((item) => item.status === "completed" && item.result_url),
    [filtered]
  );

  const lightboxIndex = useMemo(
    () => (lightboxId ? lightboxItems.findIndex((item) => item.id === lightboxId) : -1),
    [lightboxId, lightboxItems]
  );

  const handleLightboxDeleted = useCallback(
    (id: string) => {
      const currentIndex = lightboxItems.findIndex((item) => item.id === id);
      const remaining = lightboxItems.filter((item) => item.id !== id);
      if (!remaining.length) {
        setLightboxId(null);
      } else {
        const next = remaining[Math.min(currentIndex, remaining.length - 1)];
        setLightboxId(next.id);
      }
      setGenerations((prev) => prev.filter((item) => item.id !== id));
    },
    [lightboxItems]
  );

  const handleLightboxUpdated = useCallback(
    (id: string, params: NonNullable<LightboxItem["params"]>) => {
      setGenerations((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, params: { ...item.params, ...params } } : item
        )
      );
    },
    []
  );

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
          Escreva um prompt no painel abaixo e clique em Gerar. Suas criações aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 px-1 pb-48 pt-[76px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {filtered.map((generation) => (
          <GenerationCard
            key={generation.id}
            gen={generation}
            onOpen={() => setLightboxId(generation.id)}
          />
        ))}
      </div>

      {lightboxId && lightboxIndex >= 0 && (
        <MediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxId(null)}
          onNavigate={(nextIndex) => {
            const next = lightboxItems[nextIndex];
            if (next) setLightboxId(next.id);
          }}
          onDeleted={handleLightboxDeleted}
          onUpdated={handleLightboxUpdated}
        />
      )}
    </>
  );
}

function GenerationCard({ gen, onOpen }: { gen: Generation; onOpen: () => void }) {
  const setReferenceImageUrl = useStudioStore((s) => s.setReferenceImageUrl);

  const isPending = gen.status === "pending" || gen.status === "processing";
  const isDone = gen.status === "completed" && gen.result_url;
  const modelText = gen.model_label || gen.model_slug || "modelo";
  const aspect = gen.params?.aspect_ratio || (gen.type === "video" ? "16:9" : "1:1");
  const style = aspectStyle(gen);

  if (isPending) {
    return <PendingCard type={gen.type} modelText={modelText} aspect={aspect} style={style} />;
  }

  if (!isDone) {
    return (
      <article
        style={style}
        className="relative overflow-hidden rounded-lg bg-[#141414]"
      >
        <div className="flex h-full w-full items-center justify-center text-xs text-[#888888]">
          Falha na geração
        </div>
      </article>
    );
  }

  const addAsReference = () => {
    setReferenceImageUrl(gen.result_url!);
    toast.success("Adicionado como referência");
  };

  return (
    <article
      onClick={onOpen}
      style={gen.type === "audio" ? undefined : style}
      className="group relative cursor-pointer overflow-hidden rounded-lg"
    >
      {gen.type === "image" ? (
        <Image
          src={gen.result_url!}
          alt={gen.prompt}
          width={1024}
          height={1024}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : gen.type === "video" ? (
        <VideoTile src={gen.result_url!} />
      ) : (
        <audio
          src={gen.result_url!}
          controls
          onClick={(event) => event.stopPropagation()}
          className="w-full rounded-lg bg-[#141414] p-3"
        />
      )}

      {(gen.type === "image" || gen.type === "video") && (
        <>
          <div className="absolute inset-0 flex items-center justify-center transition group-hover:bg-black/40">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur">
              <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
            </span>
          </div>

          <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
            <ActionIcon
              onClick={(event) => {
                event.stopPropagation();
                toast.success("Adicionado aos favoritos");
              }}
            >
              <Heart className="h-3.5 w-3.5" />
            </ActionIcon>

            <ActionIcon
              onClick={(event) => {
                event.stopPropagation();
                const link = document.createElement("a");
                link.href = gen.result_url!;
                link.download = "geracao";
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.click();
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </ActionIcon>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                addAsReference();
              }}
              className="h-8 w-full rounded-lg bg-white/15 text-xs font-medium text-white backdrop-blur"
            >
              Usar como referência
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function VideoTile({ src }: { src: string }) {
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
    videoRef.current.currentTime = 0;
  }

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="metadata"
      className="h-full w-full object-cover"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

function PendingCard({
  type,
  modelText,
  aspect,
  style,
}: {
  type: Generation["type"];
  modelText: string;
  aspect: string;
  style: React.CSSProperties;
}) {
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((current) => {
        if (current >= 95) return 95;
        return Math.min(95, current + (current < 60 ? 4 : 2));
      });
    }, 550);

    return () => clearInterval(timer);
  }, []);

  const label = type === "video" ? "Gerando vídeo..." : type === "audio" ? "Gerando áudio..." : "Gerando imagem...";

  return (
    <article style={style} className="relative overflow-hidden rounded-lg">
      <div className="relative flex h-full flex-col items-center justify-center bg-[#141414]">
        <Loader2 className="h-6 w-6 animate-spin text-[#F5F5F5]" />
        <p className="mt-2 text-xs text-[#888888]">{label}</p>

        <div className="absolute inset-x-2 bottom-8 h-1 overflow-hidden rounded-full bg-[#2A2A2A]">
          <div className="h-full rounded-full bg-[#7C3AED] transition-[width] duration-500 ease-linear" style={{ width: `${progress}%` }} />
        </div>

        <p className="absolute bottom-3 left-2 text-[10px] text-[#888888]">
          {modelText} · {aspect}
        </p>
        <p className="absolute bottom-3 right-2 text-[10px] text-[#888888]">{progress}%</p>
      </div>
    </article>
  );
}

function ActionIcon({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur"
    >
      {children}
    </button>
  );
}
