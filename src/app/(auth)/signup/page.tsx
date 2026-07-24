import { Suspense } from "react";
import { AuthForm } from "@/components/shared/auth-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Ganhe <span className="font-semibold text-accent">10 créditos grátis</span> ao se cadastrar.
        </p>
      </div>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
