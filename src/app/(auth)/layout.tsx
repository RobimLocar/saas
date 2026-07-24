import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* glow de fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ao continuar, você concorda com os Termos e a Política de Privacidade do Fluxyra.
        </p>
      </div>
    </div>
  );
}
