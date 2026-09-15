import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com service role — para operações confiáveis no servidor
 * (upload no Storage, escrita em tabelas) que precisam ignorar RLS.
 * NUNCA expor no cliente/browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
