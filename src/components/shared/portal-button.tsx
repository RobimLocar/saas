"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

// P7c — Abre o Stripe Customer Portal (gerenciar assinatura: método de pagamento,
// faturas, cancelamento e troca de plano se habilitado no Dashboard). O customer id
// é resolvido no SERVIDOR a partir do perfil autenticado (nunca do browser); as
// mudanças voltam pela via de webhooks. Se o usuário não tem assinatura, o servidor
// responde 400 e mostramos uma mensagem clara.
export function PortalButton() {
  const [loading, setLoading] = useState(false);

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return; // navegação em curso; mantém loading
      }
      toast.error(data.error || "Não foi possível abrir o portal de cobrança.");
    } catch {
      toast.error("Erro ao abrir o portal de cobrança.");
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      title="Gerenciar assinatura"
      aria-label="Gerenciar assinatura"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A] text-[#B4B4B8] transition-colors hover:text-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
    </button>
  );
}
