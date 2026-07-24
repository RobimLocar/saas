"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login, signup, type AuthResult } from "@/app/(auth)/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isLogin = mode === "login";
  const action = isLogin ? login : signup;
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/studio";

  const [state, formAction] = useActionState<AuthResult, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />

      {!isLogin && (
        <div className="space-y-2">
          <Label htmlFor="fullName">Nome completo</Label>
          <Input
            id="fullName"
            name="fullName"
            type="text"
            placeholder="Como podemos te chamar?"
            autoComplete="name"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="voce@exemplo.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton label={isLogin ? "Entrar" : "Criar conta grátis"} />

      <p className="text-center text-sm text-muted-foreground">
        {isLogin ? (
          <>
            Não tem conta?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Cadastre-se
            </Link>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Entrar
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
