"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LOCALE_COOKIE,
  locales,
  localeLabels,
  localeFlags,
  type Locale,
} from "@/i18n/config";

export function LanguageSwitcher() {
  const router = useRouter();
  const active = useLocale() as Locale;
  const t = useTranslations("topbar");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function choose(locale: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setOpen(false);
    // Re-renderiza os server components com o novo idioma.
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("language")}
        className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-sm text-[#F5F5F5]"
      >
        <Globe className="h-4 w-4 text-[#888888]" />
        <span className="hidden sm:inline">{localeFlags[active]}</span>
        <span className="font-medium uppercase">{active}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-[#666666] transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[180px] rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-1 shadow-xl">
          {locales.map((locale) => {
            const isActive = locale === active;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => choose(locale)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition",
                  isActive
                    ? "bg-[#2A2A2A] text-[#F5F5F5]"
                    : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                )}
              >
                <span>{localeFlags[locale]}</span>
                <span className="flex-1 text-left">{localeLabels[locale]}</span>
                {isActive && <Check className="h-4 w-4 text-[#7C3AED]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
