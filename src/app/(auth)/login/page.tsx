import { Suspense } from "react";
import { AuthForm } from "@/components/shared/auth-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Bem-vindo de volta</h1>
        <p className="text-sm text-muted-foreground">
          Entre para continuar criando com o Fluxyra.
        </p>
      </div>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
