import Link from "next/link";
import { Logo } from "@/components/shared/logo";

const FOOTER_LINKS = [
  { href: "#workflow", label: "Produto" },
  { href: "#pricing", label: "Planos" },
  { href: "#", label: "Privacidade" },
  { href: "#", label: "Termos" },
  { href: "#", label: "Contato" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 md:flex-row md:justify-between">
        <Logo showText />
        <nav aria-label="Links do rodapé" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">© 2026 Fluxyra. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
