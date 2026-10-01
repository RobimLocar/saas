"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { requestPasswordReset, updatePassword, type AuthResult } from "@/app/(auth)/actions";

const LINK_ERRORS: Record<string, string> = {
  link_expirado: "Esse link expirou ou já foi usado. Peça um novo abaixo.",
  link_invalido: "Link inválido. Peça um novo abaixo.",
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}

function Feedback({ state, linkError }: { state: AuthResult; linkError?: string }) {
  const error = state.error ?? linkError;
  return (
    <>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {state.message}
        </p>
      )}
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthResult, FormData>(requestPasswordReset, {});
  const linkError = LINK_ERRORS[useSearchParams().get("error") ?? ""];

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail da conta</Label>
        <Input id="email" name="email" type="email" placeholder="voce@exemplo.com" autoComplete="email" required />
      </div>
      <Feedback state={state} linkError={state.message ? undefined : linkError} />
      {!state.message && <SubmitButton label="Enviar link" />}
      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<AuthResult, FormData>(updatePassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" name="password" type="password" placeholder="Mínimo de 8 caracteres" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Repita a nova senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Feedback state={state} />
      <SubmitButton label="Salvar nova senha" />
    </form>
  );
}
