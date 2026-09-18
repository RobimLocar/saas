import { Suspense } from "react";
import { AuthForm } from "@/components/shared/auth-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Teste grátis: gere <span className="font-semibold text-accent">1 imagem com IA</span>. Sem cartão.
        </p>
      </div>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
