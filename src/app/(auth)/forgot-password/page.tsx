import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/shared/password-forms";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Esqueceu a senha?</h1>
        <p className="text-sm text-muted-foreground">
          Informe o e-mail da sua conta e enviaremos um link para criar uma nova.
        </p>
      </div>
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
