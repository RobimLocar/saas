"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Workflow, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  is_template: boolean;
  created_at: string;
  updated_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/flows", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          setFlows([]);
          return;
        }
        throw new Error(data?.error || "Falha ao carregar flows.");
      }
      setFlows(Array.isArray(data?.flows) ? data.flows : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar flows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFlow() {
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Novo Flow" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao criar flow.");
      router.push(`/flows/${data.flow.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar flow.");
      setCreating(false);
    }
  }

  async function deleteFlow(id: string) {
    if (!window.confirm("Excluir este flow?")) return;
    setWorkingId(id);
    try {
      const res = await fetch(`/api/flows/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Falha ao excluir flow.");
      }
      setFlows((prev) => prev.filter((f) => f.id !== id));
      toast.success("Flow excluído.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir flow.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-6 px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED]/15 text-[#A78BFA]">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#F5F5F5]">Flows</h1>
            <p className="text-sm text-[#888888]">
              Encadeie prompts, modelos e referências em um fluxo visual.
            </p>
          </div>
        </div>
        <Button
          onClick={() => void createFlow()}
          disabled={creating}
          className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
        >
          <Plus className="mr-1 h-4 w-4" />
          {creating ? "Criando..." : "Novo Flow"}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-40 rounded-2xl" />
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7C3AED]/10">
            <Workflow className="h-6 w-6 text-[#7C3AED]" />
          </div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Nenhum flow ainda</h2>
          <p className="max-w-sm text-sm text-[#888888]">
            Crie seu primeiro fluxo visual para encadear geração de imagem, vídeo e áudio.
          </p>
          <Button
            onClick={() => void createFlow()}
            disabled={creating}
            className="mt-2 rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo Flow
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="group relative flex flex-col rounded-2xl border border-[#242428] bg-[#141416] p-5 transition-colors hover:border-[#7C3AED]/40"
            >
              <Link href={`/flows/${flow.id}`} className="flex flex-1 flex-col">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#7C3AED]/15 text-[#A78BFA]">
                  <Workflow className="h-5 w-5" />
                </div>
                <h3 className="truncate text-sm font-semibold text-[#F5F5F5]">{flow.name}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-xs text-[#888888]">
                  {flow.description || "Sem descrição"}
                </p>
                <p className="mt-3 text-[11px] text-[#666666]">
                  Atualizado em {formatDate(flow.updated_at || flow.created_at)}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => void deleteFlow(flow.id)}
                disabled={workingId === flow.id}
                title="Excluir"
                aria-label="Excluir"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2A2A] text-[#888888] opacity-0 transition hover:border-[#3A1F1F] hover:bg-[#2A1313] hover:text-[#FCA5A5] group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
