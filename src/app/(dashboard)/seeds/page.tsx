"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Package, Pencil, Plus, Sparkles, Sprout, Trash2, Upload, User, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudioStore } from "@/stores/use-studio-store";
import { cn } from "@/lib/utils";

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

const SEED_TYPES = [
  { id: "character", label: "Character", desc: "Uma pessoa ou persona", Icon: User },
  { id: "product", label: "Product", desc: "Um objeto ou item", Icon: Package },
  { id: "custom", label: "Custom", desc: "Um estilo ou cena", Icon: Sparkles },
] as const;
type SeedType = (typeof SEED_TYPES)[number]["id"];

const SEED_TYPE_COPY: Record<SeedType, { title: string; sub: string; ph: string; details: string }> = {
  character: {
    title: "Criar personagem",
    sub: "Adicione fotos de referência para a IA saber como a pessoa é.",
    ph: "ex.: Sarah, CyberNova, Capitão Rex",
    details: "Detalhes extras: roupas, acessórios, tatuagens, maquiagem, vibe...",
  },
  product: {
    title: "Criar produto",
    sub: "Adicione fotos de referência para a IA saber como o produto é.",
    ph: "ex.: LuxyBottle, GlowSerum, SkyPod",
    details: "Detalhes extras: materiais, cores, acabamento, tamanho, features...",
  },
  custom: {
    title: "Criar asset custom",
    sub: "Adicione fotos de referência para a IA saber como é.",
    ph: "ex.: Buddy, MinhaLogo, CasaDosSonhos",
    details: "Detalhes extras: forma, marcas, traços característicos, vibe...",
  },
};

// Capas mockadas — cole a URL da imagem depois; "" mostra o placeholder.
const PRESET_TEMPLATES: { id: SeedType; title: string; desc: string; image: string }[] = [
  { id: "character", title: "Influencer", desc: "Treine uma pessoa de IA consistente — influencer, porta-voz ou modelo.", image: "" },
  { id: "product", title: "Produto", desc: "Treine seu produto para a IA renderizá-lo com precisão toda vez.", image: "" },
  { id: "custom", title: "Custom", desc: "Treine qualquer coisa: pets, logos, veículos, estilos de arte e mais.", image: "" },
];

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
  const [seedType, setSeedType] = useState<SeedType>("character");
  const [seedFiles, setSeedFiles] = useState<{ file: File; url: string }[]>([]);

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
    setSeedType("character");
    setSeedFiles([]);
    setModalOpen(true);
  }

  function openCreateWithType(type: SeedType) {
    setEditing(null);
    setForm(emptyForm());
    setSeedType(type);
    setSeedFiles([]);
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

  function addSeedFiles(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setSeedFiles((prev) => [...prev, ...added]);
  }

  function removeSeedFile(idx: number) {
    setSeedFiles((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
    seedFiles.forEach((f) => URL.revokeObjectURL(f.url));
    setSeedFiles([]);
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
        let previewUrl: string | null = null;
        if (seedFiles.length > 0) {
          try {
            const fd = new FormData();
            fd.append("file", seedFiles[0].file);
            const ures = await fetch("/api/upload", { method: "POST", body: fd });
            const udata = await ures.json().catch(() => null);
            if (ures.ok && udata?.url) previewUrl = udata.url;
          } catch {
            // sem upload — cria sem capa
          }
        }
        const res = await fetch("/api/seeds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: form.description.trim() || null,
            tags,
            preview_url: previewUrl,
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
    <div className="space-y-6 px-6">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Preset templates</h2>
          <p className="text-sm text-[#888888]">Comece com um seed pronto e personalize.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PRESET_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openCreateWithType(t.id)}
              className="group relative flex h-[240px] flex-col justify-end overflow-hidden rounded-2xl border border-[#242428] bg-[#1A1A1A] p-5 text-left transition-transform duration-200 hover:-translate-y-0.5"
            >
              {t.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image} alt={t.title} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#2a1f45] via-[#171326] to-[#0f0d16]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                    <Sprout className="h-6 w-6 text-[#A78BFA]" />
                  </span>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="relative">
                <h3 className="text-lg font-semibold text-white">{t.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{t.desc}</p>
                <span className="mt-3 inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0A0A0A]">
                  Iniciar treino
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

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
        <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] px-4">
          <EmptyState
            icon={Sprout}
            title="Você ainda não possui seeds salvos."
            description="Salve referências no lightbox ou crie manualmente para reutilizar no Studio."
            action={{ label: "Novo Seed", onClick: openCreateModal }}
          />
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
          <div className="flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-[#242428] bg-[#141416]">
            <div className="hidden w-[236px] shrink-0 flex-col border-r border-[#242428] bg-[#101012] p-5 sm:flex">
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C3AED]/15 ring-1 ring-[#7C3AED]/30">
                  <Sprout className="h-4 w-4 text-[#A78BFA]" />
                </span>
                <span className="text-sm font-semibold text-[#F5F5F5]">Novo Seed</span>
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#666666]">Tipo</p>
              {SEED_TYPES.map((t) => {
                const active = seedType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={Boolean(editing)}
                    onClick={() => setSeedType(t.id)}
                    className={cn(
                      "mb-2 flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50",
                      active ? "border-[#7C3AED] bg-[#7C3AED]/10" : "border-[#242428] hover:bg-white/5"
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#26262b] ring-1 ring-white/10">
                      <t.Icon className="h-4 w-4 text-[#c9c9d1]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#F5F5F5]">{t.label}</span>
                      <span className="block truncate text-[11px] text-[#8b8b93]">{t.desc}</span>
                    </span>
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        active ? "border-[#7C3AED]" : "border-[#555555]"
                      )}
                    >
                      {active ? <span className="h-2 w-2 rounded-full bg-[#7C3AED]" /> : null}
                    </span>
                  </button>
                );
              })}
              <p className="mt-auto pt-4 text-[11px] leading-relaxed text-[#777777]">
                Seeds mantêm as gerações da IA consistentes no Fluxyra.
              </p>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#F5F5F5]">
                    {editing ? "Editar seed" : SEED_TYPE_COPY[seedType].title}
                  </h2>
                  <p className="mt-1 text-sm text-[#888888]">{SEED_TYPE_COPY[seedType].sub}</p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-[#888888] transition-colors hover:text-[#F5F5F5]"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#E5E5E5]">Nome</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={SEED_TYPE_COPY[seedType].ph}
                    className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#E5E5E5]">Detalhes adicionais</label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={SEED_TYPE_COPY[seedType].details}
                    className="min-h-28 resize-none border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                  />
                </div>
                <div>
                  {seedFiles.length === 0 ? (
                    <label
                      htmlFor="seed-refs"
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#2A2A2A] bg-[#1A1A1A]/60 p-4 transition-colors hover:border-[#7C3AED]/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                        <Upload className="h-5 w-5 text-[#888888]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[#F5F5F5]">Upload de referências</span>
                        <span className="block text-xs text-[#888888]">Arraste ou clique — 4 a 8 fotos</span>
                      </span>
                    </label>
                  ) : (
                    <div className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A]/60 p-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {seedFiles.map((f, i) => (
                          <div
                            key={i}
                            className="group relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.url} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeSeedFile(i)}
                              aria-label="Remover foto"
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <label
                          htmlFor="seed-refs"
                          className="flex h-[76px] w-[76px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#2A2A2A] text-[#888888] transition-colors hover:border-[#7C3AED]/50 hover:text-[#F5F5F5]"
                        >
                          <Plus className="h-5 w-5" />
                        </label>
                      </div>
                      {seedFiles.length < 4 ? (
                        <p className="mt-2 text-right text-xs text-[#FCA5A5]">
                          Adicione mais {4 - seedFiles.length} (pelo menos 4 necessárias)
                        </p>
                      ) : (
                        <p className="mt-2 text-right text-xs text-[#4ADE80]">
                          {seedFiles.length} fotos prontas
                        </p>
                      )}
                    </div>
                  )}
                  <input
                    id="seed-refs"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addSeedFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[#242428] pt-4">
                <span className="text-xs text-[#777777]">
                  {editing
                    ? "Edite os detalhes do seed."
                    : !form.name.trim()
                    ? "Dê um nome ao seed."
                    : seedFiles.length < 4
                    ? `Adicione mais ${4 - seedFiles.length} foto(s) de referência.`
                    : "Tudo pronto para criar."}
                </span>
                <div className="flex gap-2">
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
                    disabled={
                      saving ||
                      !form.name.trim() ||
                      (!editing && seedFiles.length < 4)
                    }
                  >
                    {saving ? "Salvando..." : editing ? "Salvar" : "Criar Seed"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
