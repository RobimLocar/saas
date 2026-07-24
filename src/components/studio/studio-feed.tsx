"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, AlertCircle, Download, Music, Sparkles } from "lucide-react";
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
}

const POLL_MS = 3000;

export function StudioFeed() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshKey = useStudioStore((s) => s.refreshKey);
  const viewFilter = useStudioStore((s) => s.viewFilter);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGenerations = useCallback(async () => {
    try {
      const res = await fetch("/api/generations?limit=60", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGenerations(data.generations || []);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar ao montar e quando uma nova geração é disparada
  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations, refreshKey]);

  // Polling das gerações em andamento
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

    if (pollRef.current) return; // já tem polling ativo

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
            // continua
          }
        })
      );

      if (anyFinished) {
        fetchGenerations();
      }
    }, POLL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generations, fetchGenerations]);

  const filtered =
    viewFilter === "all"
      ? generations
      : generations.filter((g) => g.type === viewFilter);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-[76px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 pt-[76px] text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Sua galeria está vazia
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Escreva um prompt no painel abaixo e clique em Gerar. Suas criações
          aparecerão aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="px-1 pb-40 pt-[76px] [column-count:2] [column-gap:6px] sm:[column-count:3] lg:[column-count:4] xl:[column-count:5]">
      {filtered.map((g) => (
        <GenerationCard key={g.id} gen={g} />
      ))}
    </div>
  );
}

function GenerationCard({ gen }: { gen: Generation }) {
  const isPending = gen.status === "pending" || gen.status === "processing";
  const isFailed = gen.status === "failed";
  const isDone = gen.status === "completed" && gen.result_url;

  return (
    <article className="group relative mb-1.5 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card">
      {/* Processando */}
      {isPending && (
        <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-secondary/40">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="px-4 text-center text-xs text-muted-foreground">
            Gerando {gen.type === "image" ? "imagem" : gen.type === "video" ? "vídeo" : "áudio"}…
          </span>
        </div>
      )}

      {/* Falhou */}
      {isFailed && (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-destructive/10 px-4 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <span className="text-xs text-destructive">Falha na geração</span>
          <span className="text-[10px] text-muted-foreground">
            Créditos reembolsados
          </span>
        </div>
      )}

      {/* Concluído - imagem */}
      {isDone && gen.type === "image" && (
        <div className="relative">
          <Image
            src={gen.result_url!}
            alt={gen.prompt}
            width={512}
            height={512}
            className="w-full object-cover"
            unoptimized
          />
          <CardOverlay url={gen.result_url!} />
        </div>
      )}

      {/* Concluído - vídeo */}
      {isDone && gen.type === "video" && (
        <div className="relative">
          <video
            src={gen.result_url!}
            className="w-full object-cover"
            controls
            loop
            muted
            playsInline
          />
          <CardOverlay url={gen.result_url!} />
        </div>
      )}

      {/* Concluído - áudio */}
      {isDone && gen.type === "audio" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Music className="h-4 w-4 text-primary" />
            <span className="truncate">{gen.prompt}</span>
          </div>
          <audio src={gen.result_url!} controls className="w-full" />
        </div>
      )}

      {/* Legenda do prompt */}
      {isDone && gen.type !== "audio" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 opacity-0 transition group-hover:opacity-100">
          <p className="line-clamp-2 text-[11px] text-white/90">{gen.prompt}</p>
        </div>
      )}
    </article>
  );
}

function CardOverlay({ url }: { url: string }) {
  return (
    <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
      <a
        href={url}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur transition hover:bg-black/70"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
