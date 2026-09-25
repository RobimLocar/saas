import Link from "next/link";
import { getCurrentProfile } from "@/lib/supabase/queries";

// FLUXYRA-STUDIO-NAVIGATION-UX-PASS-02 — minimal read-only account overview
// so the Topbar user menu's "Configurações" entry has a real destination
// instead of a dead link. Reuses the same getCurrentProfile() query the
// dashboard layout already calls — no new Supabase query, no new API route,
// no billing logic; actual plan changes/payment management still go through
// /pricing and the existing Stripe customer portal.
export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold text-[#F5F5F5]">Configurações</h1>
      <p className="mt-1 text-sm text-[#888888]">Informações da sua conta Fluxyra.</p>

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-[#242428] bg-[#141416] p-5">
          <p className="text-xs uppercase tracking-wide text-[#666666]">E-mail</p>
          <p className="mt-1 text-sm text-[#F5F5F5]">{profile?.email ?? "—"}</p>
        </div>

        <div className="rounded-2xl border border-[#242428] bg-[#141416] p-5">
          <p className="text-xs uppercase tracking-wide text-[#666666]">Plano atual</p>
          <p className="mt-1 text-sm capitalize text-[#F5F5F5]">{profile?.plan ?? "free"}</p>
        </div>

        <div className="rounded-2xl border border-[#242428] bg-[#141416] p-5">
          <p className="text-xs uppercase tracking-wide text-[#666666]">Créditos disponíveis</p>
          <p className="mt-1 text-sm text-[#F5F5F5]">{profile?.credits_balance ?? 0}</p>
        </div>

        <div className="rounded-2xl border border-[#242428] bg-[#141416] p-5">
          <p className="text-xs uppercase tracking-wide text-[#666666]">Gerenciar assinatura</p>
          <p className="mt-1 text-sm text-[#888888]">
            Para trocar de plano, recarregar créditos ou atualizar forma de pagamento, acesse{" "}
            <Link href="/pricing" className="text-[#8B5CF6] hover:underline">
              planos e preços
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
