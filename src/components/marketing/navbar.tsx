"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";

const NAV_LINKS = [
  { href: "#workflow", label: "Recursos" },
  { href: "#ecosystem", label: "Studio" },
  { href: "#flows", label: "Flows" },
  { href: "#pricing", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:px-6">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between rounded-2xl border border-border bg-surface/90 px-4 shadow-[0_1px_2px_rgba(21,19,25,0.04),0_12px_32px_-16px_rgba(21,19,25,0.12)] backdrop-blur-xl sm:px-5">
        <Link
          href="/"
          className="flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          aria-label="Fluxyra — página inicial"
        >
          <Logo showText />
        </Link>

        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Começar grátis
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav-panel"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav-panel"
          className="mx-auto mt-2 flex max-w-[1200px] flex-col gap-1 rounded-2xl border border-border bg-surface p-3 shadow-[0_12px_32px_-16px_rgba(21,19,25,0.16)] md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-foreground px-3 py-2.5 text-center text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
