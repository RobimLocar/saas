import { ResetPasswordForm } from "@/components/shared/password-forms";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Criar nova senha</h1>
        <p className="text-sm text-muted-foreground">Escolha uma senha com pelo menos 8 caracteres.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
