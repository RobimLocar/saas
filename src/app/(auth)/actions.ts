"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

export interface AuthResult {
  error?: string;
  /** Mensagem de sucesso que mantém o usuário na tela (ex.: "confira seu e-mail"). */
  message?: string;
}

const MIN_PASSWORD = 8;

/** URL pública para links de e-mail (confirmação e recuperação de senha). */
function authCallbackUrl(next: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

function envConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && !url.startsWith("YOUR_");
}

export async function login(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  if (!envConfigured()) {
    return { error: "Supabase ainda não configurado neste ambiente." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectPath(formData.get("redirect"), "/studio");

  if (!email || !password) {
    return { error: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signup(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  if (!envConfigured()) {
    return { error: "Supabase ainda não configurado neste ambiente." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Preencha e-mail e senha." };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: authCallbackUrl("/studio"),
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Com confirmação de e-mail ligada no Supabase, não há sessão até o
  // usuário clicar no link — fica na tela com a instrução.
  if (!data.session) {
    return {
      message: "Conta criada! Enviamos um link de confirmação para o seu e-mail. Abra o link para começar a criar.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/studio");
}

/**
 * Envia o link de redefinição de senha. Sempre responde a mesma mensagem,
 * exista ou não a conta (não revela quais e-mails estão cadastrados).
 */
export async function requestPasswordReset(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  if (!envConfigured()) {
    return { error: "Supabase ainda não configurado neste ambiente." };
  }
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Informe o e-mail da sua conta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl("/reset-password"),
  });
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }

  return {
    message: "Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também o spam.",
  };
}

/** Define a nova senha. Exige a sessão aberta pelo link do e-mail. */
export async function updatePassword(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  if (!envConfigured()) {
    return { error: "Supabase ainda não configurado neste ambiente." };
  }
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) {
    return { error: `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.` };
  }
  if (password !== confirm) {
    return { error: "As senhas não conferem." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "O link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\"." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: /different from the old|same password/i.test(error.message)
        ? "A nova senha precisa ser diferente da anterior."
        : "Não foi possível alterar a senha. Tente de novo.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/studio");
}

export async function logout() {
  if (envConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
