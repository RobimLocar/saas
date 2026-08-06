"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Copy, FolderPlus, Heart, ImageIcon, Music, Pencil, Plus, Sparkles, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudioStore } from "@/stores/use-studio-store";
import { cn } from "@/lib/utils";

type PromptType = "image" | "video" | "audio";
type PromptFilter = "all" | PromptType;

interface SavedPrompt {
  id: string;
  title: string | null;
  prompt: string;
  type: PromptType | null;
  tags: string[] | null;
  use_count: number;
  created_at: string;
  source?: "saved" | "generation";
  result_url?: string | null;
  model?: string | null;
}

interface PromptFormState {
  id?: string;
  title: string;
  prompt: string;
  type: "" | PromptType;
  tags: string;
}

const FILTER_LABEL: Record<PromptFilter, string> = {
  all: "Todos",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
};

const TYPE_META: Record<PromptType, { label: string; color: string; Icon: typeof ImageIcon }> = {
  image: { label: "Image", color: "#F97316", Icon: ImageIcon },
  video: { label: "Video", color: "#3B82F6", Icon: Video },
  audio: { label: "Audio", color: "#22D3EE", Icon: Music },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function emptyForm(): PromptFormState {
  return {
    title: "",
    prompt: "",
    type: "",
    tags: "",
  };
}

export default function MyPromptsPage() {
  const router = useRouter();
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  const [filter, setFilter] = useState<PromptFilter>("all");
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadPrompts = useCallback(
    async (targetFilter: PromptFilter, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const qs =
          targetFilter === "all"
            ? "?type=any"
            : `?type=${encodeURIComponent(targetFilter)}`;
        const res = await fetch(`/api/prompts${qs}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          if (res.status === 401) {
            setPrompts([]);
            toast.error("Faça login para ver seus prompts salvos.");
            return;
          }
          throw new Error(data?.error || "Falha ao carregar prompts.");
        }

        const saved: SavedPrompt[] = (Array.isArray(data?.prompts) ? data.prompts : []).map(
          (p: SavedPrompt) => ({ ...p, source: "saved" as const })
        );
        let gens: SavedPrompt[] = [];
        try {
          const gType = targetFilter === "all" ? "all" : targetFilter;
          const gres = await fetch(
            `/api/generations?type=${encodeURIComponent(gType)}&limit=100`,
            { cache: "no-store" }
          );
          const gdata = await gres.json().catch(() => null);
          const list = Array.isArray(gdata?.generations) ? gdata.generations : [];
          const savedTexts = new Set(saved.map((x) => x.prompt.trim()));
          gens = list
            .filter(
              (g: { prompt?: string }) =>
                typeof g.prompt === "string" &&
                g.prompt.trim().length > 0 &&
                !savedTexts.has(g.prompt.trim())
            )
            .map((g: Record<string, unknown>) => {
              const model =
                (g.model as string) ||
                (g.model_id as string) ||
                ((g.ai_models as { name?: string } | null)?.name ?? null);
              return {
                id: `gen:${String(g.id)}`,
                title: null,
                prompt: String(g.prompt),
                type: (g.type as PromptType) ?? null,
                tags: model ? [model] : [],
                use_count: 0,
                created_at: String(g.created_at ?? new Date().toISOString()),
                source: "generation" as const,
                result_url: (g.result_url as string) ?? null,
                model: model ?? null,
              } as SavedPrompt;
            });
        } catch {
          // sem histórico — segue só com os salvos
        }
        const merged = [...saved, ...gens].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setPrompts(merged);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar prompts.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadPrompts(filter);
  }, [filter, loadPrompts]);

  const filteredPrompts = useMemo(() => {
    if (filter === "all") return prompts;
    return prompts.filter((p) => p.type === filter);
  }, [filter, prompts]);

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEditModal(prompt: SavedPrompt) {
    setEditingId(prompt.id);
    setForm({
      id: prompt.id,
      title: prompt.title ?? "",
      prompt: prompt.prompt,
      type: prompt.type ?? "",
      tags: (prompt.tags || []).join(", "),
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSave() {
    const promptText = form.prompt.trim();
    if (!promptText) {
      toast.error("O texto do prompt é obrigatório.");
      return;
    }

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      prompt: promptText,
      title: form.title.trim() || undefined,
      type: form.type || undefined,
      tags,
    };

    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/prompts/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao atualizar prompt.");
        }

        setPrompts((prev) =>
          prev.map((p) => (p.id === editingId ? (data.prompt as SavedPrompt) : p))
        );
        toast.success("Prompt atualizado com sucesso.");
      } else {
        const res = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao criar prompt.");
        }

        setPrompts((prev) => [data.prompt as SavedPrompt, ...prev]);
        toast.success("Prompt criado com sucesso.");
      }

      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar prompt.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (id.startsWith("gen:")) {
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Removido da biblioteca.");
      return;
    }
    setWorkingId(id);
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao excluir prompt.");
      }
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Prompt excluído.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir prompt.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleCopy(promptItem: SavedPrompt) {
    try {
      await navigator.clipboard.writeText(promptItem.prompt);
      toast.success("Prompt copiado.");
    } catch {
      toast.error("Não foi possível copiar o prompt.");
    }
  }

  async function handleUse(promptItem: SavedPrompt) {
    setWorkingId(promptItem.id);
    try {
      setPrompt(promptItem.prompt);
      if (
        promptItem.type === "image" ||
        promptItem.type === "video" ||
        promptItem.type === "audio"
      ) {
        setActiveTab(promptItem.type);
      }

      if (promptItem.source === "generation") {
        toast.success("Abrindo no Studio…");
        router.push("/studio");
        return;
      }

      const res = await fetch(`/api/prompts/${promptItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "use" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Não foi possível atualizar o uso do prompt.");
      }

      setPrompts((prev) =>
        prev.map((p) => (p.id === promptItem.id ? (data.prompt as SavedPrompt) : p))
      );
      toast.success("Abrindo no Studio…");
      router.push("/studio");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao usar prompt.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-6 px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">My Prompts</h1>
          <p className="mt-1 text-sm text-[#888888]">
            Salve prompts prontos para reutilizar com um clique.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
        >
          <Plus className="mr-1 h-4 w-4" />
          Novo Prompt
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as PromptFilter)}>
        <TabsList className="bg-[#1A1A1A]">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="image">Imagem</TabsTrigger>
          <TabsTrigger value="video">Vídeo</TabsTrigger>
          <TabsTrigger value="audio">Áudio</TabsTrigger>
        </TabsList>

        {(["all", "image", "video", "audio"] as PromptFilter[]).map((tab) => (
          <TabsContent key={tab} value={tab}>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-4"
                  >
                    <Skeleton className="mb-3 h-5 w-1/2 bg-[#232323]" />
                    <Skeleton className="mb-2 h-4 w-full bg-[#232323]" />
                    <Skeleton className="mb-2 h-4 w-[92%] bg-[#232323]" />
                    <Skeleton className="h-8 w-full bg-[#232323]" />
                  </div>
                ))}
              </div>
            ) : filteredPrompts.length === 0 ? (
              <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] px-4">
                <EmptyState
                  icon={Sparkles}
                  title={`Nenhum prompt salvo em ${FILTER_LABEL[tab]}.`}
                  description="Crie seu primeiro prompt para reutilizar no Studio em um clique."
                  action={{ label: "Novo Prompt", onClick: openCreateModal }}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredPrompts.map((item) => {
                  const meta = item.type ? TYPE_META[item.type] : null;
                  const iconBtn =
                    "flex h-7 w-7 items-center justify-center rounded-md border border-[#2A2A2A] text-[#888888] transition-colors hover:bg-white/5 hover:text-[#e5e5e5] disabled:opacity-50";
                  return (
                    <div
                      key={item.id}
                      className="flex min-w-0 flex-col rounded-2xl border border-[#242424] bg-[#121212] p-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex min-w-0 items-center gap-1.5 text-xs text-[#8b8b93]">
                          {meta ? (
                            <>
                              <meta.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
                              <span className="shrink-0 font-medium" style={{ color: meta.color }}>
                                {meta.label}
                              </span>
                            </>
                          ) : null}
                          {item.model ? (
                            <>
                              <span className="shrink-0 text-[#555555]">·</span>
                              <span className="truncate">{item.model}</span>
                            </>
                          ) : null}
                          <span className="shrink-0 text-[#555555]">·</span>
                          <span className="shrink-0">{formatDate(item.created_at)}</span>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-1">
                          <button type="button" title="Copiar" aria-label="Copiar" onClick={() => void handleCopy(item)} className={iconBtn}>
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {item.source !== "generation" ? (
                            <button type="button" title="Editar" aria-label="Editar" onClick={() => openEditModal(item)} className={iconBtn}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button type="button" title="Mover para pasta" aria-label="Mover para pasta" onClick={() => toast("Pastas em breve.")} className={iconBtn}>
                            <FolderPlus className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" title="Excluir" aria-label="Excluir" disabled={workingId === item.id} onClick={() => void handleDelete(item.id)} className={cn(iconBtn, "hover:border-[#3A1F1F] hover:bg-[#2A1313] hover:text-[#FCA5A5]")}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" title="Favoritar" aria-label="Favoritar" onClick={() => toast("Favoritos em breve.")} className={iconBtn}>
                            <Heart className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="mb-4 line-clamp-6 flex-1 text-sm leading-relaxed text-[#A3A3A3]">
                        {item.prompt}
                      </p>

                      <Button
                        className="w-full rounded-xl bg-white text-[#0A0A0A] hover:bg-white/90 disabled:opacity-50"
                        disabled={workingId === item.id}
                        onClick={() => void handleUse(item)}
                      >
                        Use prompt
                        <ArrowUpRight className="ml-1.5 h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2A2A2A] bg-[#131313] p-5">
            <h2 className="text-lg font-semibold text-[#F5F5F5]">
              {editingId ? "Editar prompt" : "Novo prompt"}
            </h2>
            <p className="mt-1 text-sm text-[#888888]">
              {editingId
                ? "Ajuste o texto e os metadados do seu prompt."
                : "Crie um prompt para reutilizar rapidamente depois."}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Título</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex.: Gancho para anúncio de skincare"
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      type: e.target.value as PromptFormState["type"],
                    }))
                  }
                  className="h-9 w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 text-sm text-[#F5F5F5] outline-none"
                >
                  <option value="">Qualquer</option>
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                  <option value="audio">Áudio</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Prompt</label>
                <Textarea
                  value={form.prompt}
                  onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
                  placeholder="Descreva seu prompt aqui..."
                  className="min-h-28 border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Tags (separadas por vírgula)</label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="ex.: skincare, roteiro, gancho"
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
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar prompt"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
