import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

function envConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && !url.startsWith("YOUR_");
}

/**
 * Retorna o profile do usuário autenticado, ou null se não logado /
 * ambiente sem Supabase configurado (build/preview).
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!envConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

export function initialsFromProfile(profile: Profile | null): string {
  const source = profile?.full_name || profile?.email || "Fluxyra";
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
