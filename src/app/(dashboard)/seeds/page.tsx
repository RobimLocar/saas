"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const SEED_TYPES = [
  { id: "character", labelKey: "typeCharacter", descKey: "typeCharacterDesc", Icon: User },
  { id: "product", labelKey: "typeProduct", descKey: "typeProductDesc", Icon: Package },
  { id: "custom", labelKey: "typeCustom", descKey: "typeCustomDesc", Icon: Sparkles },
] as const;
type SeedType = (typeof SEED_TYPES)[number]["id"];

const SEED_TYPE_COPY: Record<
  SeedType,
  { titleKey: string; subKey: string; phKey: string; detailsKey: string }
> = {
  character: { titleKey: "copyCharTitle", subKey: "copyCharSub", phKey: "copyCharPh", detailsKey: "copyCharDetails" },
  product: { titleKey: "copyProdTitle", subKey: "copyProdSub", phKey: "copyProdPh", detailsKey: "copyProdDetails" },
  custom: { titleKey: "copyCustomTitle", subKey: "copyCustomSub", phKey: "copyCustomPh", detailsKey: "copyCustomDetails" },
};

// Capas mockadas — cole a URL da imagem depois; "" mostra o placeholder.
const PRESET_TEMPLATES: { id: SeedType; titleKey: string; descKey: string; image: string }[] = [
  { id: "character", titleKey: "presetCharTitle", descKey: "presetCharDesc", image: "" },
  { id: "product", titleKey: "presetProdTitle", descKey: "presetProdDesc", image: "" },
  { id: "custom", titleKey: "presetCustomTitle", descKey: "presetCustomDesc", image: "" },
];

export default function SeedsPage() {
  const t = useTranslations("seeds");
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

  const formatDate = useCallback(
    (iso: string | null): string => {
      if (!iso) return t("neverUsed");
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    },
    [t]
  );

  const loadSeeds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seeds", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          setSeeds([]);
          toast.error(t("toastLoginRequired"));
          return;
        }
        throw new Error(data?.error || t("toastLoadFail"));
      }

      setSeeds(Array.isArray(data?.seeds) ? data.seeds : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      toast.error(t("toastNameRequired"));
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
          throw new Error(data?.error || t("toastUpdateError"));
        }

        setSeeds((prev) => prev.map((s) => (s.id === editing.id ? data.seed : s)));
        toast.success(t("toastUpdated"));
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
          throw new Error(data?.error || t("toastCreateError"));
        }

        setSeeds((prev) => [data.seed, ...prev]);
        toast.success(t("toastCreated"));
      }

      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastSaveFail"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(seed: SeedItem) {
    const confirmed = window.confirm(t("confirmDelete", { name: seed.name || t("confirmUnnamed") }));
    if (!confirmed) return;

    setWorkingId(seed.id);
    try {
      const res = await fetch(`/api/seeds/${seed.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || t("toastDeleteError"));
      }
      setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
      toast.success(t("toastDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastDeleteFail"));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleUse(seed: SeedItem) {
    if (!seed.preview_url) {
      toast.error(t("toastNoPreview"));
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
        throw new Error(data?.error || t("toastUseError"));
      }

      setSeeds((prev) => prev.map((s) => (s.id === seed.id ? data.seed : s)));
      setReferenceImageUrl(seed.preview_url);
      setActiveTab("image");
      toast.success(t("toastOpeningStudio"));
      router.push("/studio");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastUseFail"));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-6 px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#888888]">{t("subtitle")}</p>
        </div>

        <Button
          onClick={openCreateModal}
          className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("newSeed")}
        </Button>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">{t("presetTitle")}</h2>
          <p className="text-sm text-[#888888]">{t("presetSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PRESET_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => openCreateWithType(tpl.id)}
              className="group relative flex h-[240px] flex-col justify-end overflow-hidden rounded-2xl border border-[#242428] bg-[#1A1A1A] p-5 text-left transition-transform duration-200 hover:-translate-y-0.5"
            >
              {tpl.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tpl.image} alt={t(tpl.titleKey)} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#2a1f45] via-[#171326] to-[#0f0d16]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                    <Sprout className="h-6 w-6 text-[#A78BFA]" />
                  </span>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="relative">
                <h3 className="text-lg font-semibold text-white">{t(tpl.titleKey)}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/70">{t(tpl.descKey)}</p>
                <span className="mt-3 inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0A0A0A]">
                  {t("startTraining")}
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
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={{ label: t("newSeed"), onClick: openCreateModal }}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orderedSeeds.map((seed) => (
            <div
              key={seed.id}
              className="flex min-w-0 flex-col rounded-xl border border-[#2A2A2A] bg-[#141414] p-3"
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
                <h3 className="min-w-0 truncate text-sm font-semibold text-[#F5F5F5]">
                  {seed.name || t("unnamed")}
                </h3>
                <Badge variant="outline" className="border-[#2A2A2A] text-[#BDBDBD]">
                  {t("uses", { n: seed.use_count || 0 })}
                </Badge>
              </div>

              <p className="line-clamp-3 min-h-[54px] text-sm leading-relaxed text-[#A3A3A3]">
                {seed.description || t("noDescription")}
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
                {t("lastUse", { date: formatDate(seed.last_used_at) })}
              </p>

              <div className="mt-3 flex items-center gap-1.5">
                <Button
                  className="min-w-0 flex-1 bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50"
                  disabled={workingId === seed.id || !seed.preview_url}
                  onClick={() => void handleUse(seed)}
                >
                  {t("use")}
                </Button>
                <Button
                  variant="outline"
                  className="border-[#2A2A2A] px-2.5 text-[#F5F5F5]"
                  title={t("edit")}
                  aria-label={t("edit")}
                  disabled={workingId === seed.id}
                  onClick={() => openEditModal(seed)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  className="border-[#3A1F1F] px-2.5 text-[#FCA5A5] hover:bg-[#2A1313]"
                  title={t("delete")}
                  aria-label={t("delete")}
                  disabled={workingId === seed.id}
                  onClick={() => void handleDelete(seed)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
                <span className="text-sm font-semibold text-[#F5F5F5]">{t("newSeed")}</span>
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#666666]">{t("typeLabel")}</p>
              {SEED_TYPES.map((st) => {
                const active = seedType === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    disabled={Boolean(editing)}
                    onClick={() => setSeedType(st.id)}
                    className={cn(
                      "mb-2 flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50",
                      active ? "border-[#7C3AED] bg-[#7C3AED]/10" : "border-[#242428] hover:bg-white/5"
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#26262b] ring-1 ring-white/10">
                      <st.Icon className="h-4 w-4 text-[#c9c9d1]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#F5F5F5]">{t(st.labelKey)}</span>
                      <span className="block truncate text-[11px] text-[#8b8b93]">{t(st.descKey)}</span>
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
                {t("seedsKeepConsistent")}
              </p>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#F5F5F5]">
                    {editing ? t("editSeed") : t(SEED_TYPE_COPY[seedType].titleKey)}
                  </h2>
                  <p className="mt-1 text-sm text-[#888888]">{t(SEED_TYPE_COPY[seedType].subKey)}</p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-[#888888] transition-colors hover:text-[#F5F5F5]"
                  aria-label={t("close")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#E5E5E5]">{t("nameLabel")}</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t(SEED_TYPE_COPY[seedType].phKey)}
                    className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#E5E5E5]">{t("detailsLabel")}</label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={t(SEED_TYPE_COPY[seedType].detailsKey)}
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
                        <span className="block text-sm font-medium text-[#F5F5F5]">{t("uploadRefs")}</span>
                        <span className="block text-xs text-[#888888]">{t("uploadHint")}</span>
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
                              aria-label={t("removePhoto")}
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
                          {t("addMorePhotos", { n: 4 - seedFiles.length })}
                        </p>
                      ) : (
                        <p className="mt-2 text-right text-xs text-[#4ADE80]">
                          {t("photosReady", { n: seedFiles.length })}
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
                    ? t("statusEdit")
                    : !form.name.trim()
                    ? t("statusName")
                    : seedFiles.length < 4
                    ? t("statusAddPhotos", { n: 4 - seedFiles.length })
                    : t("statusReady")}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-[#2A2A2A] text-[#E5E5E5]"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    {t("cancel")}
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
                    {saving ? t("saving") : editing ? t("save") : t("createSeed")}
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
