"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthResult {
  error?: string;
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
  const redirectTo = String(formData.get("redirect") ?? "/studio");

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
  if (password.length < 6) {
    return { error: "A senha deve ter pelo menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/studio`,
    },
  });

  if (error) {
    return { error: error.message };
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
