"use client";

import Image from "next/image";
import { Play, Heart, Download } from "lucide-react";

export interface MediaItem {
  id: string;
  url: string;
  alt: string;
  height: number;
  isVideo?: boolean;
}

function Card({ item }: { item: MediaItem }) {
  return (
    <article
      className="group relative mb-1.5 break-inside-avoid overflow-hidden rounded-lg"
      style={{ height: item.height }}
    >
      <Image
        src={item.url}
        alt={item.alt}
        fill
        sizes="(max-width: 768px) 50vw, 16vw"
        className="object-cover"
        unoptimized
      />

      {item.isVideo && (
        <div className="absolute inset-0 flex items-center justify-center transition group-hover:bg-black/40">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur">
            <Play className="ml-0.5 h-4 w-4 text-white" fill="currentColor" />
          </span>
        </div>
      )}

      <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur">
          <Heart className="h-3.5 w-3.5" />
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur">
          <Download className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          className="h-8 w-full rounded-lg bg-white/15 text-xs font-medium text-white backdrop-blur transition hover:bg-white/25"
        >
          Usar como referência
        </button>
      </div>
    </article>
  );
}

export function MediaGallery({ items }: { items: MediaItem[] }) {
  return (
    <div className="px-1 pb-40 pt-[76px] [column-count:2] [column-gap:6px] sm:[column-count:3] lg:[column-count:5] xl:[column-count:6]">
      {items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </div>
  );
}
