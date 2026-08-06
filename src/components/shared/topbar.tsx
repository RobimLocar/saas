"use client";

import Link from "next/link";
import { Eye, ChevronDown, LayoutDashboard, ImageIcon, Video, Music } from "lucide-react";
import { LogoMark } from "@/components/shared/logo";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/stores/use-studio-store";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

type ViewFilter = "all" | "image" | "video" | "audio";

const VIEW_OPTIONS: { value: ViewFilter; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { value: "all", labelKey: "filterAll", icon: LayoutDashboard },
  { value: "image", labelKey: "filterImage", icon: ImageIcon },
  { value: "video", labelKey: "filterVideo", icon: Video },
  { value: "audio", labelKey: "filterAudio", icon: Music },
];

function Popover({
  trigger,
  children,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
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
        className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-sm"
      >
        {trigger(open)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[180px] rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-1 shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const t = useTranslations("topbar");
  const viewFilter = useStudioStore((s) => s.viewFilter);
  const setViewFilter = useStudioStore((s) => s.setViewFilter);

  const selected = VIEW_OPTIONS.find((item) => item.value === viewFilter) ?? VIEW_OPTIONS[0];

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#1e1e22] bg-[#0A0A0A]/80 px-6 backdrop-blur-md">
      <Link href="/studio" className="flex items-center gap-4">
        <LogoMark className="h-9 w-9" />
        <div className="flex items-center gap-2 text-sm text-[#F5F5F5]">
          <LayoutDashboard className="h-4 w-4 text-[#888888]" />
          <span className="font-medium">Studio</span>
        </div>
      </Link>

      <div className="flex items-center gap-2">
      <Popover
        trigger={(open) => (
          <>
            <Eye className="h-4 w-4 text-[#888888]" />
            <span className="text-[#888888]">{t("viewLabel")}</span>
            <span className="font-medium text-[#F5F5F5]">{t(selected.labelKey)}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#666666] transition", open && "rotate-180")} />
          </>
        )}
      >
        {(close) => (
          <div className="space-y-1">
            {VIEW_OPTIONS.map(({ value, labelKey, icon: Icon }) => {
              const active = value === viewFilter;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setViewFilter(value);
                    close();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition",
                    active ? "bg-[#2A2A2A] text-[#F5F5F5]" : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}
          </div>
        )}
      </Popover>
      <LanguageSwitcher />
      </div>
    </header>
  );
}
