"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Download, Folder, ImageIcon, Music, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaLightbox, type LightboxItem } from "@/components/studio/media-lightbox";

type Filter = "all" | "image" | "video" | "audio";

const FILTERS: { id: Filter; key: "filterAll" | "filterImage" | "filterVideo" | "filterAudio" }[] = [
  { id: "all", key: "filterAll" },
  { id: "image", key: "filterImage" },
  { id: "video", key: "filterVideo" },
  { id: "audio", key: "filterAudio" },
];

function typeKey(t: string): "filterImage" | "filterVideo" | "filterAudio" {
  if (t === "video") return "filterVideo";
  if (t === "audio") return "filterAudio";
  return "filterImage";
}

function aspectStyle(item: LightboxItem): CSSProperties {
  if (item.type === "audio") return { height: "110px" };
  const ar = item.params?.aspect_ratio;
  if (!ar) return { aspectRatio: item.type === "video" ? "16/9" : "1/1" };
  const [w, h] = ar.split(":").map(Number);
  if (!w || !h) return { aspectRatio: "1/1" };
  return { aspectRatio: `${w}/${h}` };
}

export default function AssetsPage() {
  const t = useTranslations("assets");
  const [items, setItems] = useState<LightboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/generations?limit=200", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const done = ((data.generations as LightboxItem[]) || []).filter(
        (g) => g.status === "completed" && g.result_url
      );
      setItems(done);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.type === filter)),
    [items, filter]
  );

  const lightboxIndex = useMemo(
    () => (lightboxId ? filtered.findIndex((i) => i.id === lightboxId) : -1),
    [lightboxId, filtered]
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      image: items.filter((i) => i.type === "image").length,
      video: items.filter((i) => i.type === "video").length,
      audio: items.filter((i) => i.type === "audio").length,
    }),
    [items]
  );

  const handleDeleted = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setLightboxId(null);
  }, []);

  const handleUpdated = useCallback(
    (id: string, params: NonNullable<LightboxItem["params"]>) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, params: { ...i.params, ...params } } : i))
      );
    },
    []
  );

  return (
    <div className="px-6 pb-24 pt-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED]/15 text-[#A78BFA]">
            <Folder className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#F5F5F5]">{t("title")}</h1>
            <p className="text-sm text-[#888888]">{t("subtitle")}</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-lg border border-[#242428] bg-[#111113] p-0.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-[#7C3AED]/15 font-medium text-[#A78BFA]"
                    : "text-[#8b8b93] hover:text-white"
                )}
              >
                {t(f.key)}
                <span className="ml-1.5 text-[11px] text-[#5a5a63]">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer aspect-[4/3] rounded-2xl" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7C3AED]/10">
            <Folder className="h-6 w-6 text-[#7C3AED]" />
          </div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">{t("emptyTitle")}</h2>
          <p className="max-w-sm text-sm text-[#888888]">{t("emptyDesc")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((item) => (
            <AssetCard key={item.id} item={item} onOpen={() => setLightboxId(item.id)} />
          ))}
        </div>
      )}

      {lightboxId && lightboxIndex >= 0 && (
        <MediaLightbox
          items={filtered}
          index={lightboxIndex}
          onClose={() => setLightboxId(null)}
          onNavigate={(next) => {
            const n = filtered[next];
            if (n) setLightboxId(n.id);
          }}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}

function AssetCard({ item, onOpen }: { item: LightboxItem; onOpen: () => void }) {
  const t = useTranslations("assets");
  const label = t(typeKey(item.type));
  return (
    <article
      onClick={onOpen}
      style={aspectStyle(item)}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-[#141416] ring-1 ring-white/5 transition-all duration-200 hover:scale-[1.015] hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:ring-[#7C3AED]/30"
    >
      {item.type === "image" ? (
        <Image
          src={item.result_url!}
          alt={item.prompt}
          width={1024}
          height={1024}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : item.type === "video" ? (
        <video
          src={item.result_url!}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C3AED]/15 text-[#A78BFA]">
            <Music className="h-4 w-4" />
          </div>
          <audio
            src={item.result_url!}
            controls
            onClick={(e) => e.stopPropagation()}
            className="w-full"
          />
        </div>
      )}

      {(item.type === "image" || item.type === "video") && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          {item.type === "video" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
              </span>
            </div>
          )}
          <div className="absolute left-2 top-2 flex items-center gap-1">
            <span className="flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
              {item.type === "image" ? <ImageIcon className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {label}
            </span>
          </div>
          <a
            href={item.result_url!}
            download
            onClick={(e) => e.stopPropagation()}
            title={t("download")}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 group-hover:opacity-100"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </>
      )}
    </article>
  );
}
