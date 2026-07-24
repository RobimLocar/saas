import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Zap } from "lucide-react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Header ─────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between px-6">
          <Link href="/">
            <Logo showText />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition">
              Recursos
            </Link>
            <Link href="#models" className="hover:text-foreground transition">
              Modelos
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition">
              Planos
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
            >
              <Zap className="w-4 h-4" />
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Content ────────────────────────────────────── */}
      <main className="pt-16">{children}</main>

      {/* ─── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border/50 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo showText />
          <p className="text-sm text-muted-foreground">
            © 2026 Fluxyra. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-foreground">
              Termos
            </Link>
            <Link href="#" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="#" className="hover:text-foreground">
              Contato
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
