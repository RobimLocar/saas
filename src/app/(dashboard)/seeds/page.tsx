"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Sprout, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioStore } from "@/stores/use-studio-store";

interface SeedItem {
  id: string;
  name: string | null;
  description: string | null;
  asset_id: string | null;
  preview_url: string | null;
  tags: string[] | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface SeedFormState {
  name: string;
  description: string;
  tags: string;
}

function emptyForm(): SeedFormState {
  return {
    name: "",
    description: "",
    tags: "",
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca usado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function SeedsPage() {
  const router = useRouter();
  const setReferenceImageUrl = useStudioStore((s) => s.setReferenceImageUrl);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  const [seeds, setSeeds] = useState<SeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SeedItem | null>(null);
  const [form, setForm] = useState<SeedFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadSeeds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seeds", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          setSeeds([]);
          toast.error("Faça login para ver seus seeds.");
          return;
        }
        throw new Error(data?.error || "Falha ao carregar seeds.");
      }

      setSeeds(Array.isArray(data?.seeds) ? data.seeds : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar seeds.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSeeds();
  }, [loadSeeds]);

  const orderedSeeds = useMemo(() => {
    return [...seeds].sort((a, b) => {
      const la = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const lb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      if (lb !== la) return lb - la;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [seeds]);

  function openCreateModal() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEditModal(seed: SeedItem) {
    setEditing(seed);
    setForm({
      name: seed.name || "",
      description: seed.description || "",
      tags: (seed.tags || []).join(", "),
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) {
      toast.error("O nome do seed é obrigatório.");
      return;
    }

    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/seeds/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: form.description.trim() || null,
            tags,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao atualizar seed.");
        }

        setSeeds((prev) => prev.map((s) => (s.id === editing.id ? data.seed : s)));
        toast.success("Seed atualizada com sucesso.");
      } else {
        const res = await fetch("/api/seeds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: form.description.trim() || null,
            tags,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao criar seed.");
        }

        setSeeds((prev) => [data.seed, ...prev]);
        toast.success("Seed criada com sucesso.");
      }

      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar seed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(seed: SeedItem) {
    const confirmed = window.confirm(`Excluir o seed "${seed.name || "Sem nome"}"?`);
    if (!confirmed) return;

    setWorkingId(seed.id);
    try {
      const res = await fetch(`/api/seeds/${seed.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao excluir seed.");
      }
      setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
      toast.success("Seed excluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir seed.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleUse(seed: SeedItem) {
    if (!seed.preview_url) {
      toast.error("Este seed não possui preview para usar no Studio.");
      return;
    }

    setWorkingId(seed.id);
    try {
      const res = await fetch(`/api/seeds/${seed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "use" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao registrar uso do seed.");
      }

      setSeeds((prev) => prev.map((s) => (s.id === seed.id ? data.seed : s)));
      setReferenceImageUrl(seed.preview_url);
      setActiveTab("image");
      toast.success("Abrindo no Studio…");
      router.push("/studio");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao usar seed.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">Seeds</h1>
          <p className="mt-1 text-sm text-[#888888]">
            Reutilize referências visuais para manter consistência entre gerações.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
        >
          <Plus className="mr-1 h-4 w-4" />
          Novo Seed
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-3"
            >
              <Skeleton className="mb-3 h-28 w-full bg-[#232323]" />
              <Skeleton className="mb-2 h-4 w-2/3 bg-[#232323]" />
              <Skeleton className="h-4 w-full bg-[#232323]" />
            </div>
          ))}
        </div>
      ) : orderedSeeds.length === 0 ? (
        <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A]">
            <Sprout className="h-5 w-5 text-[#8B5CF6]" />
          </div>
          <p className="text-base text-[#F5F5F5]">Você ainda não possui seeds salvos.</p>
          <p className="mt-1 text-sm text-[#888888]">
            Salve referências no lightbox ou crie manualmente por aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orderedSeeds.map((seed) => (
            <div
              key={seed.id}
              className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-3"
            >
              <div className="relative mb-3 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A]">
                {seed.preview_url ? (
                  <Image
                    src={seed.preview_url}
                    alt={seed.name || "Seed"}
                    width={420}
                    height={240}
                    className="h-36 w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center text-[#666666]">
                    <Sprout className="h-5 w-5" />
                  </div>
                )}
              </div>

              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 text-sm font-semibold text-[#F5F5F5]">
                  {seed.name || "Seed sem nome"}
                </h3>
                <Badge variant="outline" className="border-[#2A2A2A] text-[#BDBDBD]">
                  {seed.use_count || 0} usos
                </Badge>
              </div>

              <p className="line-clamp-3 min-h-[54px] text-sm leading-relaxed text-[#A3A3A3]">
                {seed.description || "Sem descrição"}
              </p>

              <div className="mt-2 flex flex-wrap gap-1">
                {(seed.tags || []).map((tag) => (
                  <Badge
                    key={`${seed.id}-${tag}`}
                    variant="ghost"
                    className="border border-[#2A2A2A] text-[#8E8E8E]"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>

              <p className="mt-2 text-xs text-[#777777]">
                Último uso: {formatDate(seed.last_used_at)}
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="border-[#2A2A2A] text-[#F5F5F5]"
                  disabled={workingId === seed.id || !seed.preview_url}
                  onClick={() => void handleUse(seed)}
                >
                  Usar no Studio
                </Button>
                <Button
                  variant="outline"
                  className="border-[#2A2A2A] text-[#F5F5F5]"
                  disabled={workingId === seed.id}
                  onClick={() => openEditModal(seed)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="border-[#3A1F1F] text-[#FCA5A5] hover:bg-[#2A1313]"
                  disabled={workingId === seed.id}
                  onClick={() => void handleDelete(seed)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2A2A2A] bg-[#131313] p-5">
            <h2 className="text-lg font-semibold text-[#F5F5F5]">
              {editing ? "Editar seed" : "Novo seed"}
            </h2>
            <p className="mt-1 text-sm text-[#888888]">
              {editing
                ? "Atualize nome, descrição e tags deste seed."
                : "Crie um seed para reutilizar referências no Studio."}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Nome *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex.: Personagem principal - camp. X"
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Descrição</label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Notas sobre estilo, personagem, iluminação..."
                  className="min-h-24 border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Tags (vírgula)</label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="ex.: personagem, hero, closeup"
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                onClick={closeModal}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar seed"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
