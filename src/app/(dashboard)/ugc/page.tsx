"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Pencil, Plus, Trash2, ChevronRight, Sparkles, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BROLL_PRESETS } from "@/lib/ugc-broll-presets";

type ViewMode = "list" | "project";
type UgcTab = "script" | "avatar" | "broll" | "generations";

interface ProductItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  created_at: string;
}

interface ProductFormState {
  title: string;
  description: string;
  imageUrl: string;
}

interface ScriptShape {
  hook: { text: string };
  body1: { text: string };
  body2: { text: string };
  cta: { text: string };
}

interface UgcProject {
  id: string;
  name: string;
  product_id: string | null;
  avatar_seed_id: string | null;
  avatar_label: string | null;
  avatar_image_url: string | null;
  status: string | null;
  script: ScriptShape | null;
  segments: unknown;
  broll: unknown;
  created_at: string;
  updated_at: string | null;
}

interface ProductCardEditState {
  name: string;
  description: string;
  tags: string;
}

interface BrollClip {
  preset: string;
  label?: string;
  generation_id: string;
  status: "processing" | "completed" | "failed";
  duration?: number;
  audio?: boolean;
  created_at?: string;
  result_url?: string;
  product_image_url?: string;
}

type AvatarFormat = "9:16" | "1:1" | "16:9";

const FORMAT_PRESETS: Record<AvatarFormat, { width: number; height: number }> = {
  "9:16": { width: 576, height: 1024 },
  "1:1": { width: 768, height: 768 },
  "16:9": { width: 1024, height: 576 },
};

function isAvatarFormat(value: unknown): value is AvatarFormat {
  return value === "9:16" || value === "1:1" || value === "16:9";
}

function parseDuration(value: unknown): 4 | 6 | 8 {
  return value === 4 || value === 6 || value === 8 ? value : 6;
}

function parseResolution(value: unknown): "720p" | "1080p" | "4k" {
  return value === "1080p" || value === "4k" ? value : "720p";
}

function parseFormat(value: unknown): AvatarFormat {
  return isAvatarFormat(value) ? value : "9:16";
}

function ImageDropzone({
  id,
  title,
  subtitle,
  disabled,
  onFileSelect,
  cta,
}: {
  id: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onFileSelect: (file: File) => void;
  cta?: string;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      htmlFor={id}
      className={`block rounded-lg border-2 border-dashed p-4 text-center transition ${
        dragging
          ? "border-[#7C3AED] bg-[#7C3AED]/10"
          : "border-[#2A2A2A] bg-[#1A1A1A] hover:border-[#7C3AED]/60"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        const file = event.dataTransfer.files?.[0];
        if (file) onFileSelect(file);
      }}
    >
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelect(file);
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <Upload className="h-5 w-5 text-[#A78BFA]" />
        <p className="text-sm font-medium text-[#E5E5E5]">{title}</p>
        <p className="text-xs text-[#888888]">{subtitle || "Arraste e solte ou clique para selecionar"}</p>
        {cta && <span className="text-xs text-[#A78BFA]">{cta}</span>}
      </div>
    </label>
  );
}

function emptyForm(): ProductFormState {
  return {
    title: "",
    description: "",
    imageUrl: "",
  };
}

function emptyProjectForm(): ProductCardEditState {
  return {
    name: "",
    description: "",
    tags: "",
  };
}

function emptyScript(): ScriptShape {
  return {
    hook: { text: "" },
    body1: { text: "" },
    body2: { text: "" },
    cta: { text: "" },
  };
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function statusLabel(status: string | null): string {
  const s = (status || "draft").toLowerCase();
  if (s === "ready") return "Pronto";
  if (s === "processing") return "Processando";
  if (s === "published") return "Publicado";
  if (s === "failed") return "Falhou";
  return "Rascunho";
}

function avatarSegmentCost(
  duration: number,
  resolution: "720p" | "1080p" | "4k",
  _format: AvatarFormat
): number {
  const isPro = resolution === "1080p" || resolution === "4k";
  return Math.ceil((14 + 3.75 * duration) * (isPro ? 2 : 1));
}

function effectiveCostFrontend(base: number): number {
  return base;
}

function normalizeScript(raw: unknown): ScriptShape {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const part = (key: "hook" | "body1" | "body2" | "cta") => {
    const entry = obj[key] as Record<string, unknown> | undefined;
    const text = typeof entry?.text === "string" ? entry.text : "";
    return { text };
  };

  return {
    hook: part("hook"),
    body1: part("body1"),
    body2: part("body2"),
    cta: part("cta"),
  };
}

function normalizeBroll(raw: unknown): BrollClip[] {
  return Array.isArray(raw) ? (raw as BrollClip[]) : [];
}

function brollPresetLabel(key: string): string {
  const found = BROLL_PRESETS.find((x) => x.key === key);
  return found?.label || key;
}

export default function UGCPage() {
  const [view, setView] = useState<ViewMode>("list");
  const [activeTab, setActiveTab] = useState<UgcTab>("script");

  // Projetos UGC
  const [projects, setProjects] = useState<UgcProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<UgcProject | null>(null);

  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectForm, setProjectForm] = useState<ProductCardEditState>(emptyProjectForm());
  const [projectProductId, setProjectProductId] = useState<string>("");

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [projectDeleting, setProjectDeleting] = useState(false);

  const [scriptDescription, setScriptDescription] = useState("");
  const [scriptProductId, setScriptProductId] = useState<string>("");
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [scriptSaving, setScriptSaving] = useState(false);
  const [scriptDraft, setScriptDraft] = useState<ScriptShape>(emptyScript());

  // ── Talking Avatar ──
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarModal, setAvatarModal] = useState<{
    segmentKey: "hook" | "body1" | "body2" | "cta";
    label: string;
    defaultText: string;
  } | null>(null);
  const [avatarForm, setAvatarForm] = useState({
    text: "",
    accent: "Accent",
    duration: 6 as 4 | 6 | 8,
    resolution: "720p" as "720p" | "1080p" | "4k",
    format: "9:16" as AvatarFormat,
    cameraAngles: false,
    productImageUrl: "",
    productImageUploading: false,
  });
  const [avatarGenerating, setAvatarGenerating] = useState(false);
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [pollingSegments, setPollingSegments] = useState<Record<string, string>>({});

  // ── B-Roll ──
  const [brollProductImageUrl, setBrollProductImageUrl] = useState("");
  const [brollProductUploading, setBrollProductUploading] = useState(false);
  const [brollSelectedPresets, setBrollSelectedPresets] = useState<string[]>([]);
  const [brollDuration, setBrollDuration] = useState(8);
  const [brollAudio, setBrollAudio] = useState(false);
  const [brollGenerating, setBrollGenerating] = useState(false);
  const [brollUnitCost, setBrollUnitCost] = useState(0);

  // Produtos (seção 4c-1 mantida)
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductItem | null>(null);

  const [form, setForm] = useState<ProductFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const avatarFormatCacheRef = useRef<Map<string, string>>(new Map());

  const getProcessedAvatarForFormat = useCallback(
    async (avatarUrl: string, format: AvatarFormat): Promise<string> => {
      const cacheKey = `${avatarUrl}::${format}`;
      const cached = avatarFormatCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const sourceRes = await fetch(avatarUrl);
      if (!sourceRes.ok) {
        throw new Error("Falha ao baixar retrato para aplicar formato.");
      }

      const sourceBlob = await sourceRes.blob();
      const objectUrl = URL.createObjectURL(sourceBlob);

      try {
        const img = new Image();
        img.crossOrigin = "anonymous";

        const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Falha ao carregar retrato para recorte."));
          img.src = objectUrl;
        });

        const { width: targetW, height: targetH } = FORMAT_PRESETS[format];
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponível para recorte.");

        const srcW = loaded.naturalWidth;
        const srcH = loaded.naturalHeight;
        const targetAspect = targetW / targetH;
        const srcAspect = srcW / srcH;

        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (srcAspect > targetAspect) {
          sw = srcH * targetAspect;
          sx = (srcW - sw) / 2;
        } else if (srcAspect < targetAspect) {
          sh = srcW / targetAspect;
          sy = (srcH - sh) / 2;
        }

        ctx.drawImage(loaded, sx, sy, sw, sh, 0, 0, targetW, targetH);

        const outputBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Falha ao exportar retrato recortado."));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            0.92
          );
        });

        const fd = new FormData();
        fd.append("file", new File([outputBlob], `avatar-${format}.jpg`, { type: "image/jpeg" }));

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: fd,
        });
        const uploadData = await uploadRes.json().catch(() => null);

        if (!uploadRes.ok || !uploadData?.url) {
          throw new Error(uploadData?.error || "Falha ao enviar retrato no formato selecionado.");
        }

        avatarFormatCacheRef.current.set(cacheKey, uploadData.url);
        return uploadData.url as string;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    []
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          setProducts([]);
          toast.error("Faça login para ver seus produtos.");
          return;
        }
        throw new Error(data?.error || "Falha ao carregar produtos.");
      }

      setProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/ugc/projects", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          setProjects([]);
          return;
        }
        throw new Error(data?.error || "Falha ao carregar projetos UGC.");
      }

      const list = Array.isArray(data?.projects) ? data.projects : [];
      setProjects(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar projetos UGC.");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ugc/projects/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao carregar projeto.");
      }

      let project = data?.project as UgcProject;

      // Reconciliação automática: se havia segmento "processing" no DB, consultar
      // status real da geração e persistir completed/failed no próprio projeto.
      const rawSegments =
        ((project?.segments as Record<string, unknown> | null) ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
      const mergedSegments: Record<string, unknown> = { ...rawSegments };
      let changed = false;
      const nextPolling: Record<string, string> = {};

      for (const [segKey, seg] of Object.entries(rawSegments)) {
        const status = typeof seg?.status === "string" ? seg.status : "";
        const generationId =
          typeof seg?.generation_id === "string" ? seg.generation_id : "";

        if (status !== "processing" || !generationId) continue;

        try {
          const stRes = await fetch(`/api/generate/status?id=${generationId}`, {
            cache: "no-store",
          });
          const stData = await stRes.json().catch(() => null);

          if (!stRes.ok) {
            nextPolling[segKey] = generationId;
            continue;
          }

          if (stData?.status === "completed" || stData?.status === "failed") {
            const updatedSeg: Record<string, unknown> = {
              ...seg,
              status: stData.status,
              generation_id: generationId,
            };
            if (stData?.status === "completed" && stData?.result_url) {
              updatedSeg.result_url = stData.result_url;
            }
            mergedSegments[segKey] = updatedSeg;
            changed = true;
          } else {
            nextPolling[segKey] = generationId;
          }
        } catch {
          nextPolling[segKey] = generationId;
        }
      }

      if (changed) {
        const patchRes = await fetch(`/api/ugc/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: mergedSegments }),
        });
        const patchData = await patchRes.json().catch(() => null);
        if (patchRes.ok && patchData?.project) {
          project = patchData.project as UgcProject;
        } else {
          project = { ...project, segments: mergedSegments };
        }
      }

      const rawBroll = normalizeBroll(project?.broll);
      const mergedBroll: BrollClip[] = [...rawBroll];
      let brollChanged = false;

      for (let i = 0; i < mergedBroll.length; i++) {
        const clip = mergedBroll[i];
        if (clip?.status !== "processing" || !clip?.generation_id) continue;

        try {
          const stRes = await fetch(`/api/generate/status?id=${clip.generation_id}`, {
            cache: "no-store",
          });
          const stData = await stRes.json().catch(() => null);

          if (!stRes.ok) {
            nextPolling[`broll:${clip.generation_id}`] = clip.generation_id;
            continue;
          }

          if (stData?.status === "completed" || stData?.status === "failed") {
            mergedBroll[i] = {
              ...clip,
              status: stData.status,
              ...(stData?.status === "completed" && stData?.result_url
                ? { result_url: stData.result_url }
                : {}),
            };
            brollChanged = true;
          } else {
            nextPolling[`broll:${clip.generation_id}`] = clip.generation_id;
          }
        } catch {
          nextPolling[`broll:${clip.generation_id}`] = clip.generation_id;
        }
      }

      if (brollChanged) {
        const patchRes = await fetch(`/api/ugc/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broll: mergedBroll }),
        });
        const patchData = await patchRes.json().catch(() => null);
        if (patchRes.ok && patchData?.project) {
          project = patchData.project as UgcProject;
        } else {
          project = { ...project, broll: mergedBroll };
        }
      }

      setPollingSegments(nextPolling);
      setSelectedProject(project);
      setScriptDraft(normalizeScript(project?.script));
      setScriptProductId(project?.product_id || "");
      setNameDraft(project?.name || "");
      setBrollProductImageUrl(
        normalizeBroll(project?.broll).find((clip) => typeof clip.product_image_url === "string")
          ?.product_image_url || ""
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar projeto.");
    }
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setUserCredits(data?.credits ?? 0);
      }
    } catch {
      // silencioso
    }
  }, []);

  const loadBrollUnitCost = useCallback(async () => {
    try {
      const res = await fetch("/api/models?type=video", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      const models = Array.isArray(data?.models) ? data.models : [];

      const byModelId = models.find((m: { model_id?: string }) => m.model_id === "seedance-2.0-fast");
      const byName = models.find((m: { name?: string }) =>
        typeof m.name === "string" && /seedance/i.test(m.name) && /fast/i.test(m.name)
      );
      const byBackend = models.find((m: { backend?: string }) => m.backend === "seedance");
      const picked = byModelId || byName || byBackend;

      if (picked && typeof picked.credit_cost === "number") {
        setBrollUnitCost(picked.credit_cost);
      }
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadProjects();
    void loadMe();
    void loadBrollUnitCost();
  }, [loadProducts, loadProjects, loadMe, loadBrollUnitCost]);

  useEffect(() => {
    if (view !== "project" || !selectedProjectId) return;
    void loadProject(selectedProjectId);
  }, [view, selectedProjectId, loadProject]);

  useEffect(() => {
    if (!selectedProject) return;
    if (brollProductImageUrl) return;

    const fromProject = normalizeBroll(selectedProject.broll).find(
      (clip) => typeof clip.product_image_url === "string" && clip.product_image_url
    )?.product_image_url;
    if (fromProject) {
      setBrollProductImageUrl(fromProject);
      return;
    }

    const linkedProduct = products.find((p) => p.id === selectedProject.product_id);
    if (linkedProduct?.image_url) {
      setBrollProductImageUrl(linkedProduct.image_url);
    }
  }, [selectedProject, products, brollProductImageUrl]);

  const projectCount = projects.length;

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const aRef = a.updated_at || a.created_at;
      const bRef = b.updated_at || b.created_at;
      return new Date(bRef).getTime() - new Date(aRef).getTime();
    });
  }, [projects]);

  function openCreateDialog() {
    setEditing(null);
    setForm(emptyForm());
    setEditorOpen(true);
  }

  function openEditDialog(item: ProductItem) {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || "",
      imageUrl: item.image_url,
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving || uploading) return;
    setEditorOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  function openDeleteDialog(item: ProductItem) {
    setPendingDelete(item);
    setConfirmDeleteOpen(true);
  }

  function closeDeleteDialog() {
    if (workingId) return;
    setConfirmDeleteOpen(false);
    setPendingDelete(null);
  }

  async function handleUploadImage(file: File) {
    setUploading(true);
    const toastId = toast.loading("Enviando imagem...");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Erro no upload da imagem.");
      }

      setForm((prev) => ({ ...prev, imageUrl: data.url }));
      toast.success("Imagem enviada com sucesso.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar imagem.", {
        id: toastId,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveProduct() {
    const title = form.title.trim();
    const imageUrl = form.imageUrl.trim();

    if (!title || !imageUrl) {
      toast.error("Título e imagem são obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/products/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: form.description.trim() || null,
            image_url: imageUrl,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao atualizar produto.");
        }

        setProducts((prev) => prev.map((p) => (p.id === editing.id ? data.product : p)));
        toast.success("Produto atualizado.");
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: form.description.trim() || null,
            image_url: imageUrl,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Erro ao criar produto.");
        }

        setProducts((prev) => [data.product, ...prev]);
        toast.success("Produto criado.");
      }

      closeEditor();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!pendingDelete) return;

    setWorkingId(pendingDelete.id);
    try {
      const res = await fetch(`/api/products/${pendingDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao excluir produto.");
      }

      setProducts((prev) => prev.filter((p) => p.id !== pendingDelete.id));
      toast.success("Produto excluído.");
      closeDeleteDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir produto.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleCreateProject() {
    const name = projectForm.name.trim();
    if (!name) {
      toast.error("O nome do projeto é obrigatório.");
      return;
    }

    setProjectSaving(true);
    try {
      const res = await fetch("/api/ugc/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          product_id: projectProductId || null,
          avatar_label: projectForm.description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao criar projeto UGC.");
      }

      const created = data.project as UgcProject;
      setProjects((prev) => [created, ...prev]);
      setProjectCreateOpen(false);
      setProjectForm(emptyProjectForm());
      setProjectProductId("");
      setSelectedProjectId(created.id);
      setView("project");
      toast.success("Projeto criado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar projeto.");
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleInlineRename() {
    if (!selectedProject) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.error("O nome do projeto não pode ficar vazio.");
      return;
    }

    const res = await fetch(`/api/ugc/projects/${selectedProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      toast.error(data?.error || "Falha ao atualizar nome do projeto.");
      return;
    }

    const updated = data?.project as UgcProject;
    setSelectedProject(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    setNameEditing(false);
    toast.success("Nome do projeto atualizado.");
  }

  async function handleDeleteProject() {
    if (!selectedProject) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o projeto "${selectedProject.name}"?`
    );
    if (!confirmed) return;

    setProjectDeleting(true);
    try {
      const res = await fetch(`/api/ugc/projects/${selectedProject.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao excluir projeto.");
      }

      setProjects((prev) => prev.filter((p) => p.id !== selectedProject.id));
      setSelectedProjectId(null);
      setSelectedProject(null);
      setView("list");
      toast.success("Projeto excluído.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir projeto.");
    } finally {
      setProjectDeleting(false);
    }
  }

  async function handleGenerateScript() {
    if (!selectedProject) return;

    const description = scriptDescription.trim();
    if (!description) {
      toast.error("Descreva seu produto ou serviço antes de gerar o roteiro.");
      return;
    }

    setScriptGenerating(true);
    try {
      const res = await fetch(`/api/ugc/projects/${selectedProject.id}/script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          product_id: scriptProductId || null,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao gerar roteiro com IA.");
      }

      const script = normalizeScript(data?.script);
      setScriptDraft(script);
      setSelectedProject((prev) => (prev ? { ...prev, script } : prev));
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProject.id
            ? { ...p, script, updated_at: new Date().toISOString() }
            : p
        )
      );
      toast.success("Roteiro gerado com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar roteiro.");
    } finally {
      setScriptGenerating(false);
    }
  }

  async function handleSaveScript() {
    if (!selectedProject) return;

    setScriptSaving(true);
    try {
      const res = await fetch(`/api/ugc/projects/${selectedProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptDraft }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao salvar roteiro.");
      }

      const updated = data?.project as UgcProject;
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      toast.success("Roteiro salvo ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar roteiro.");
    } finally {
      setScriptSaving(false);
    }
  }

  async function handleAvatarPortraitUpload(file: File) {
    if (!selectedProject) return;
    setAvatarUploading(true);
    const toastId = toast.loading("Enviando retrato...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Erro no upload.");

      const patch = await fetch(`/api/ugc/projects/${selectedProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_image_url: data.url }),
      });
      const pData = await patch.json().catch(() => null);
      if (!patch.ok) throw new Error(pData?.error || "Erro ao salvar avatar.");

      const updated = pData?.project as UgcProject;
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p));
      toast.success("Retrato do avatar salvo.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar retrato.", { id: toastId });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleProductImageUpload(file: File) {
    setAvatarForm((prev) => ({ ...prev, productImageUploading: true }));
    const toastId = toast.loading("Enviando imagem do produto...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Erro no upload.");
      setAvatarForm((prev) => ({ ...prev, productImageUrl: data.url }));
      toast.success("Imagem do produto enviada.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar imagem.", { id: toastId });
    } finally {
      setAvatarForm((prev) => ({ ...prev, productImageUploading: false }));
    }
  }

  function openAvatarSegmentModal(
    segmentKey: "hook" | "body1" | "body2" | "cta",
    label: string,
    fallbackText: string
  ) {
    if (!selectedProject) return;

    const segments =
      ((selectedProject.segments as Record<string, unknown> | null) ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
    const seg = segments[segmentKey] || {};

    const nextText =
      typeof seg.text === "string" && seg.text.trim()
        ? seg.text
        : fallbackText;

    setAvatarForm((prev) => ({
      ...prev,
      text: nextText,
      accent: typeof seg.accent === "string" ? seg.accent : "Accent",
      duration: parseDuration(seg.duration),
      resolution: parseResolution(seg.resolution),
      format: parseFormat(seg.format),
      cameraAngles: Boolean(seg.camera_angles),
      productImageUrl:
        typeof seg.product_image_url === "string" ? seg.product_image_url : "",
      productImageUploading: false,
    }));

    setAvatarModal({
      segmentKey,
      label,
      defaultText: fallbackText,
    });
  }

  async function handleBrollProductImageUpload(file: File) {
    setBrollProductUploading(true);
    const toastId = toast.loading("Enviando imagem do produto...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Falha no upload da imagem do produto.");
      }
      setBrollProductImageUrl(data.url);
      toast.success("Imagem do produto enviada.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload.", { id: toastId });
    } finally {
      setBrollProductUploading(false);
    }
  }

  function toggleBrollPreset(presetKey: string) {
    setBrollSelectedPresets((prev) =>
      prev.includes(presetKey)
        ? prev.filter((x) => x !== presetKey)
        : [...prev, presetKey]
    );
  }

  async function handleGenerateBroll() {
    if (!selectedProject) return;

    if (!brollProductImageUrl) {
      toast.error("Envie a imagem do produto antes de gerar B-Roll.");
      return;
    }

    if (brollSelectedPresets.length === 0) {
      toast.error("Selecione pelo menos 1 preset de camera angle.");
      return;
    }

    setBrollGenerating(true);
    const toastId = toast.loading("Iniciando geração de B-Roll...");

    try {
      const res = await fetch(`/api/ugc/projects/${selectedProject.id}/broll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_image_url: brollProductImageUrl,
          presets: brollSelectedPresets,
          duration: brollDuration,
          audio: brollAudio,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao iniciar B-Roll.");
      }

      const clips = Array.isArray(data?.clips) ? (data.clips as BrollClip[]) : [];
      if (clips.length === 0) {
        throw new Error("Nenhum clipe foi iniciado.");
      }

      setSelectedProject((prev) => {
        if (!prev) return prev;
        const curr = normalizeBroll(prev.broll);
        return {
          ...prev,
          broll: [...curr, ...clips],
        };
      });

      setPollingSegments((prev) => {
        const next = { ...prev };
        for (const clip of clips) {
          next[`broll:${clip.generation_id}`] = clip.generation_id;
        }
        return next;
      });

      if (typeof data?.remaining === "number") {
        setUserCredits(data.remaining);
      } else {
        void loadMe();
      }

      toast.success(`${clips.length} clipe(s) de B-Roll em processamento.`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar B-Roll.", { id: toastId });
    } finally {
      setBrollGenerating(false);
    }
  }

  async function handleGenerateSegment() {
    if (!selectedProject || !avatarModal) return;
    setAvatarGenerating(true);
    const toastId = toast.loading(`Gerando ${avatarModal.label}...`);
    try {
      const avatarSource = selectedProject.avatar_image_url;
      if (!avatarSource) {
        throw new Error("Envie um retrato antes de gerar o segmento.");
      }

      const formattedAvatarUrl = await getProcessedAvatarForFormat(
        avatarSource,
        avatarForm.format
      );

      const res = await fetch(`/api/ugc/projects/${selectedProject.id}/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_key: avatarModal.segmentKey,
          text: avatarForm.text,
          accent: avatarForm.accent,
          duration: avatarForm.duration,
          resolution: avatarForm.resolution,
          format: avatarForm.format,
          avatar_image_url: formattedAvatarUrl,
          camera_angles: avatarForm.cameraAngles,
          product_image_url: avatarForm.productImageUrl || undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao gerar segmento.");
      }

      const generationId: string = data.generation_id;
      const key = avatarModal.segmentKey;

      setPollingSegments(prev => ({ ...prev, [key]: generationId }));

      setSelectedProject(prev => {
        if (!prev) return prev;
        const segs = (prev.segments as Record<string, unknown> | null) ?? {};
        return {
          ...prev,
          segments: {
            ...segs,
            [key]: {
              key,
              generation_id: generationId,
              status: "processing",
              text: avatarForm.text,
              duration: avatarForm.duration,
              resolution: avatarForm.resolution,
              format: avatarForm.format,
              accent: avatarForm.accent,
              camera_angles: avatarForm.cameraAngles,
              ...(avatarForm.productImageUrl
                ? { product_image_url: avatarForm.productImageUrl }
                : {}),
            },
          },
        };
      });

      if (userCredits !== null) {
        setUserCredits(prev => (prev !== null ? prev - data.cost : prev));
      }

      toast.success(`${avatarModal.label} em geração!`, { id: toastId });
      setAvatarModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar segmento.", { id: toastId });
    } finally {
      setAvatarGenerating(false);
    }
  }

  useEffect(() => {
    const keys = Object.keys(pollingSegments);
    if (keys.length === 0) return;

    const interval = setInterval(async () => {
      for (const key of keys) {
        const generationId = pollingSegments[key];
        if (!generationId) continue;

        try {
          const res = await fetch(`/api/generate/status?id=${generationId}`);
          const data = await res.json().catch(() => null);

          if (data?.status === "completed" || data?.status === "failed") {
            setPollingSegments((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });

            const currentProject = selectedProject;

            if (key.startsWith("broll:")) {
              const broll = normalizeBroll(currentProject?.broll);
              const nextBroll = broll.map((clip) => {
                if (clip.generation_id !== generationId) return clip;
                return {
                  ...clip,
                  status: data.status,
                  ...(data?.status === "completed" && data?.result_url
                    ? { result_url: data.result_url }
                    : {}),
                } as BrollClip;
              });

              setSelectedProject((prev) =>
                prev
                  ? {
                      ...prev,
                      broll: nextBroll,
                    }
                  : prev
              );

              if (currentProject?.id) {
                void fetch(`/api/ugc/projects/${currentProject.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ broll: nextBroll }),
                });
              }

              if (data?.status === "completed") {
                toast.success("Clipe de B-Roll concluído!");
                void loadMe();
              }

              if (data?.status === "failed") {
                toast.error("Clipe de B-Roll falhou. Tente novamente.");
                void loadMe();
              }
            } else {
              const segs = (currentProject?.segments as Record<string, unknown> | null) ?? {};
              const seg = (segs[key] as Record<string, unknown>) ?? {};
              const segResultUrl = typeof seg.result_url === "string" ? seg.result_url : null;

              const segmentsForPatch: Record<string, unknown> = {
                ...segs,
                [key]: {
                  ...seg,
                  generation_id:
                    typeof seg.generation_id === "string" ? seg.generation_id : generationId,
                  status: data.status,
                  ...(data?.status === "completed"
                    ? { result_url: data.result_url ?? segResultUrl }
                    : {}),
                },
              };

              setSelectedProject((prev) =>
                prev
                  ? {
                      ...prev,
                      segments: segmentsForPatch,
                    }
                  : prev
              );

              if (currentProject?.id) {
                void fetch(`/api/ugc/projects/${currentProject.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ segments: segmentsForPatch }),
                });
              }

              if (data?.status === "completed") {
                toast.success(`Segmento ${key} concluído!`);
                void loadMe();
              }

              if (data?.status === "failed") {
                toast.error(`Segmento ${key} falhou. Tente de novo.`);
                void loadMe();
              }
            }
          }
        } catch {
          // ignorar erros de polling
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingSegments, loadMe, selectedProject]);

  const hasScript = Boolean(
    scriptDraft.hook.text ||
      scriptDraft.body1.text ||
      scriptDraft.body2.text ||
      scriptDraft.cta.text
  );

  const brollTotalCost = brollUnitCost * brollSelectedPresets.length;
  const brollInsufficientCredits =
    userCredits !== null ? userCredits < brollTotalCost : false;

  const completedProjectGenerations = useMemo(() => {
    const result: Array<{ label: string; result_url: string; created_at?: string }> = [];

    const segmentLabels: Record<string, string> = {
      hook: "Avatar • Hook",
      body1: "Avatar • Body 1",
      body2: "Avatar • Body 2",
      cta: "Avatar • CTA",
    };

    const segments =
      ((selectedProject?.segments as Record<string, unknown> | null) ?? {}) as Record<
        string,
        Record<string, unknown>
      >;

    for (const [key, label] of Object.entries(segmentLabels)) {
      const seg = segments[key];
      if (seg?.status === "completed" && typeof seg.result_url === "string") {
        result.push({
          label,
          result_url: seg.result_url,
          created_at: typeof seg.created_at === "string" ? seg.created_at : undefined,
        });
      }
    }

    for (const clip of normalizeBroll(selectedProject?.broll)) {
      if (clip.status === "completed" && typeof clip.result_url === "string") {
        result.push({
          label: `B-Roll • ${clip.label || brollPresetLabel(clip.preset)}`,
          result_url: clip.result_url,
          created_at: clip.created_at,
        });
      }
    }

    return result.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [selectedProject]);

  return (
    <div className="space-y-6">
      {view === "list" ? (
        <>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-[#F5F5F5]">UGC Factory</h1>
                <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">{projectCount} projetos</Badge>
              </div>

              <Button
                onClick={() => setProjectCreateOpen(true)}
                className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
              >
                <Plus className="mr-1 h-4 w-4" />
                New UGC Project
              </Button>
            </div>

            <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5">
              <h2 className="text-base font-semibold text-[#F5F5F5]">Projetos Recentes</h2>

              {projectsLoading ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                      <Skeleton className="mb-2 h-4 w-2/3 bg-[#232323]" />
                      <Skeleton className="h-3 w-1/2 bg-[#232323]" />
                    </div>
                  ))}
                </div>
              ) : sortedProjects.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] p-6 text-center">
                  <p className="text-base text-[#F5F5F5]">Crie seu primeiro projeto UGC</p>
                  <p className="mt-1 text-sm text-[#888888]">
                    Comece gerando seu roteiro segmentado com IA.
                  </p>
                  <Button
                    onClick={() => setProjectCreateOpen(true)}
                    className="mt-4 rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    New UGC Project
                  </Button>
                </div>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {sortedProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setView("project");
                        setActiveTab("script");
                      }}
                      className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3 text-left transition hover:border-[#7C3AED]/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-[#F5F5F5]">
                          {project.name}
                        </p>
                        <ChevronRight className="h-4 w-4 text-[#777777]" />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">
                          {statusLabel(project.status)}
                        </Badge>
                        <span className="text-xs text-[#777777]">
                          {formatDate(project.updated_at || project.created_at)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Seção Meus Produtos — código preservado do 4c-1 */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#F5F5F5]">Meus Produtos</h2>
                <p className="mt-1 text-sm text-[#888888]">
                  Organize seus produtos e prepare a base para geração em escala.
                </p>
              </div>

              <Button
                onClick={openCreateDialog}
                className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar produto
              </Button>
            </div>

            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-3"
                  >
                    <Skeleton className="mb-3 h-36 w-full bg-[#232323]" />
                    <Skeleton className="mb-2 h-5 w-2/3 bg-[#232323]" />
                    <Skeleton className="mb-2 h-4 w-full bg-[#232323]" />
                    <Skeleton className="h-8 w-full bg-[#232323]" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A]">
                  <Package className="h-5 w-5 text-[#8B5CF6]" />
                </div>
                <p className="text-base text-[#F5F5F5]">
                  Cadastre seu primeiro produto para começar
                </p>
                <p className="mt-1 text-sm text-[#888888]">
                  Você poderá usar este catálogo no gerador automático de UGC.
                </p>
                <Button
                  onClick={openCreateDialog}
                  className="mt-4 rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar produto
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-3"
                  >
                    <div className="overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="h-36 w-full object-cover"
                      />
                    </div>

                    <h3 className="mt-3 line-clamp-1 text-sm font-semibold text-[#F5F5F5]">
                      {item.title}
                    </h3>
                    <p className="mt-1 line-clamp-3 min-h-[58px] text-sm text-[#A3A3A3]">
                      {item.description || "Sem descrição"}
                    </p>

                    <p className="mt-2 text-xs text-[#777777]">Criado em {formatDate(item.created_at)}</p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="border-[#2A2A2A] text-[#F5F5F5]"
                        disabled={workingId === item.id}
                        onClick={() => openEditDialog(item)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        className="border-[#3A1F1F] text-[#FCA5A5] hover:bg-[#2A1313]"
                        disabled={workingId === item.id}
                        onClick={() => openDeleteDialog(item)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-[#888888]">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setSelectedProjectId(null);
                setSelectedProject(null);
              }}
              className="hover:text-[#F5F5F5]"
            >
              UGC Factory
            </button>
            <span>/</span>
            <span className="text-[#F5F5F5]">
              {selectedProject?.name || "Projeto"}
            </span>
          </div>

          {!selectedProject ? (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-6">
              <div className="flex items-center gap-2 text-[#888888]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando projeto...
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[280px] flex-1">
                    {!nameEditing ? (
                      <button
                        type="button"
                        onClick={() => setNameEditing(true)}
                        className="text-left"
                      >
                        <h1 className="text-xl font-semibold text-[#F5F5F5]">
                          {selectedProject.name}
                        </h1>
                        <p className="mt-1 text-xs text-[#777777]">Clique para editar o nome</p>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          className="h-9 max-w-md border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                        />
                        <Button
                          onClick={() => void handleInlineRename()}
                          className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                        >
                          Salvar
                        </Button>
                        <Button
                          variant="outline"
                          className="border-[#2A2A2A] text-[#F5F5F5]"
                          onClick={() => {
                            setNameEditing(false);
                            setNameDraft(selectedProject.name);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">
                      {statusLabel(selectedProject.status)}
                    </Badge>
                    <Button
                      variant="outline"
                      className="border-[#3A1F1F] text-[#FCA5A5] hover:bg-[#2A1313]"
                      disabled={projectDeleting}
                      onClick={() => void handleDeleteProject()}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Excluir projeto
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab("script")}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      activeTab === "script"
                        ? "border-[#7C3AED] bg-[#7C3AED]/10 text-[#F5F5F5]"
                        : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                    }`}
                  >
                    <p className="text-sm font-medium">Script Writer</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("avatar")}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      activeTab === "avatar"
                        ? "border-[#7C3AED] bg-[#7C3AED]/10 text-[#F5F5F5]"
                        : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                    }`}
                  >
                    <p className="text-sm font-medium">Talking Avatar</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("broll")}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      activeTab === "broll"
                        ? "border-[#7C3AED] bg-[#7C3AED]/10 text-[#F5F5F5]"
                        : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                    }`}
                  >
                    <p className="text-sm font-medium">B-Roll</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("generations")}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      activeTab === "generations"
                        ? "border-[#7C3AED] bg-[#7C3AED]/10 text-[#F5F5F5]"
                        : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                    }`}
                  >
                    <p className="text-sm font-medium">Project Generations</p>
                  </button>
                </div>
              </div>

              {activeTab === "script" && (
                <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5">
                  <h2 className="text-base font-semibold text-[#F5F5F5]">Script Writer</h2>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_280px_auto]">
                    <div>
                      <label className="mb-1 block text-xs text-[#A3A3A3]">
                        Descreva seu produto ou serviço
                      </label>
                      <Textarea
                        value={scriptDescription}
                        onChange={(e) => setScriptDescription(e.target.value)}
                        placeholder="Ex.: Creme hidratante com vitamina C para pele oleosa, foco em brilho natural e absorção rápida"
                        className="min-h-28 border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-[#A3A3A3]">Produto relacionado (opcional)</label>
                      <select
                        value={scriptProductId}
                        onChange={(e) => setScriptProductId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 text-sm text-[#F5F5F5] outline-none"
                      >
                        <option value="">Nenhum</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <Button
                        onClick={() => void handleGenerateScript()}
                        disabled={scriptGenerating}
                        className="h-10 w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                      >
                        {scriptGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Gerar roteiro com IA ✨
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {!hasScript ? (
                    <div className="mt-5 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] p-5 text-sm text-[#888888]">
                      Descreva seu produto acima e clique em Gerar roteiro para começar.
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-[#7C3AED]/40 bg-[#7C3AED]/10 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold text-[#F5F5F5]">🎣 Hook</p>
                            <Badge className="bg-[#7C3AED]/25 text-[#E9D5FF]">Gancho</Badge>
                          </div>
                          <Textarea
                            value={scriptDraft.hook.text}
                            onChange={(e) =>
                              setScriptDraft((prev) => ({
                                ...prev,
                                hook: { text: e.target.value },
                              }))
                            }
                            className="min-h-24 border-[#7C3AED]/40 bg-[#141414] text-[#F5F5F5]"
                          />
                        </div>

                        <div className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold text-[#F5F5F5]">💬 Body 1</p>
                            <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">Benefício 1</Badge>
                          </div>
                          <Textarea
                            value={scriptDraft.body1.text}
                            onChange={(e) =>
                              setScriptDraft((prev) => ({
                                ...prev,
                                body1: { text: e.target.value },
                              }))
                            }
                            className="min-h-24 border-[#2A2A2A] bg-[#141414] text-[#F5F5F5]"
                          />
                        </div>

                        <div className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold text-[#F5F5F5]">💬 Body 2</p>
                            <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">Benefício 2</Badge>
                          </div>
                          <Textarea
                            value={scriptDraft.body2.text}
                            onChange={(e) =>
                              setScriptDraft((prev) => ({
                                ...prev,
                                body2: { text: e.target.value },
                              }))
                            }
                            className="min-h-24 border-[#2A2A2A] bg-[#141414] text-[#F5F5F5]"
                          />
                        </div>

                        <div className="rounded-lg border border-[#16A34A]/35 bg-[#16A34A]/10 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold text-[#F5F5F5]">📢 CTA</p>
                            <Badge className="bg-[#16A34A]/25 text-[#DCFCE7]">Ação</Badge>
                          </div>
                          <Textarea
                            value={scriptDraft.cta.text}
                            onChange={(e) =>
                              setScriptDraft((prev) => ({
                                ...prev,
                                cta: { text: e.target.value },
                              }))
                            }
                            className="min-h-24 border-[#16A34A]/40 bg-[#141414] text-[#F5F5F5]"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <Button
                          onClick={() => void handleSaveScript()}
                          disabled={scriptSaving}
                          className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                        >
                          {scriptSaving ? "Salvando..." : "Salvar roteiro"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "avatar" && selectedProject && (
                <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#F5F5F5]">Talking Avatar</h2>
                    {userCredits !== null && (
                      <span className="text-xs text-[#888888]">{userCredits} créditos disponíveis</span>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                    <p className="mb-2 text-xs font-medium text-[#A3A3A3]">🔒 Locked Avatar</p>
                    {selectedProject.avatar_image_url && (
                      <div className="mb-3 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#111111]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedProject.avatar_image_url}
                          alt="Avatar"
                          className="h-28 w-full object-cover"
                        />
                      </div>
                    )}

                    <ImageDropzone
                      id="ugc-avatar-portrait-drop"
                      disabled={avatarUploading}
                      title={avatarUploading ? "Enviando retrato..." : "Retrato do avatar"}
                      subtitle="Arraste e solte ou clique para selecionar"
                      cta={selectedProject.avatar_image_url ? "Trocar retrato" : "Enviar retrato"}
                      onFileSelect={(file) => {
                        void handleAvatarPortraitUpload(file);
                      }}
                    />
                  </div>

                  {selectedProject.avatar_image_url && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          { key: "hook", label: "🎣 Hook", color: "border-[#7C3AED]/40 bg-[#7C3AED]/5" },
                          { key: "body1", label: "💬 Body 1", color: "border-[#2A2A2A] bg-[#1A1A1A]" },
                          { key: "body2", label: "💬 Body 2", color: "border-[#2A2A2A] bg-[#1A1A1A]" },
                          { key: "cta", label: "📢 CTA", color: "border-[#16A34A]/35 bg-[#16A34A]/5" },
                        ] as const
                      ).map(({ key, label, color }) => {
                        const seg = ((selectedProject.segments as Record<string, unknown> | null) ?? {})[key] as
                          | Record<string, unknown>
                          | undefined;
                        const isProcessing = seg?.status === "processing";
                        const isCompleted = seg?.status === "completed";
                        const isFailed = seg?.status === "failed";
                        const videoUrl = typeof seg?.result_url === "string" ? seg.result_url : null;
                        const scriptText =
                          scriptDraft[key as keyof typeof scriptDraft]?.text ?? "";

                        return (
                          <div key={key} className={`rounded-lg border p-3 ${color}`}>
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm font-semibold text-[#F5F5F5]">{label}</p>
                              {isProcessing && (
                                <div className="flex items-center gap-1 text-xs text-[#A78BFA]">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Gerando...
                                </div>
                              )}
                              {isCompleted && !videoUrl && (
                                <Badge className="bg-[#16A34A]/20 text-[#4ADE80]">Concluído</Badge>
                              )}
                            </div>

                            {isCompleted && videoUrl ? (
                              <div className="space-y-2">
                                <video
                                  src={videoUrl}
                                  controls
                                  className="w-full rounded-lg"
                                  style={{ maxHeight: "200px" }}
                                />
                                <Button
                                  variant="outline"
                                  className="w-full border-[#2A2A2A] text-[#F5F5F5]"
                                  onClick={() => {
                                    openAvatarSegmentModal(key, label, scriptText);
                                  }}
                                >
                                  Re-gerar
                                </Button>
                              </div>
                            ) : (
                              <>
                                <p className="mb-1 line-clamp-2 text-xs text-[#888888]">
                                  {scriptText || "Sem texto no roteiro"}
                                </p>
                                <p className="mb-2 text-[11px] text-[#777777]">
                                  Formato: {parseFormat(seg?.format || "9:16")}
                                </p>
                                <Button
                                  className="w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                                  disabled={isProcessing}
                                  onClick={() => {
                                    openAvatarSegmentModal(key, label, scriptText);
                                  }}
                                >
                                  {isProcessing ? (
                                    <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Gerando...</>
                                  ) : isFailed ? (
                                    <><Sparkles className="mr-1 h-3.5 w-3.5" />Tentar de novo</>
                                  ) : (
                                    <><Sparkles className="mr-1 h-3.5 w-3.5" />Generate</>
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between">
                    <Button
                      variant="outline"
                      className="border-[#2A2A2A] text-[#F5F5F5]"
                      onClick={() => setActiveTab("script")}
                    >
                      ← Voltar ao roteiro
                    </Button>
                    <Button
                      variant="outline"
                      className="border-[#2A2A2A] text-[#F5F5F5]"
                      onClick={() => setActiveTab("broll")}
                    >
                      Ir para B-Roll →
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "broll" && selectedProject && (
                <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5 space-y-4">
                  <h2 className="text-base font-semibold text-[#F5F5F5]">B-Roll Studio</h2>
                  <div className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3 text-sm text-[#A3A3A3]">
                    Gere quantos clipes precisar — mire 1 clipe por seção de 5–8s.
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[#A3A3A3]">Product Image</label>
                    {brollProductImageUrl && (
                      <div className="overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#111111]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={brollProductImageUrl}
                          alt="Produto para B-Roll"
                          className="h-28 w-full object-cover"
                        />
                      </div>
                    )}
                    <ImageDropzone
                      id="ugc-broll-product-drop"
                      disabled={brollProductUploading}
                      title={brollProductUploading ? "Enviando imagem..." : "Imagem do produto"}
                      subtitle="Arraste e solte ou clique para selecionar"
                      cta={brollProductImageUrl ? "Trocar imagem" : "Enviar imagem"}
                      onFileSelect={(file) => {
                        void handleBrollProductImageUpload(file);
                      }}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs text-[#A3A3A3]">Camera Angle</label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {BROLL_PRESETS.map((preset) => {
                        const selected = brollSelectedPresets.includes(preset.key);
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            onClick={() => toggleBrollPreset(preset.key)}
                            className={`rounded-lg border p-3 text-left transition ${
                              selected
                                ? "border-[#7C3AED] bg-[#7C3AED]/10"
                                : "border-[#2A2A2A] bg-[#1A1A1A] hover:border-[#7C3AED]/50"
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-lg">🎬</span>
                              <span className={`h-4 w-4 rounded border ${
                                selected
                                  ? "border-[#7C3AED] bg-[#7C3AED]"
                                  : "border-[#555555]"
                              }`} />
                            </div>
                            <p className="text-sm font-medium text-[#F5F5F5]">{preset.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-[#A3A3A3]">Duration: {brollDuration}s</label>
                      <input
                        type="range"
                        min={4}
                        max={15}
                        step={1}
                        value={brollDuration}
                        onChange={(e) => setBrollDuration(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-sm text-[#F5F5F5]">
                        <button
                          type="button"
                          onClick={() => setBrollAudio((v) => !v)}
                          className={`relative h-5 w-9 rounded-full transition-colors ${
                            brollAudio ? "bg-[#7C3AED]" : "bg-[#2A2A2A]"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                              brollAudio ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        Audio On
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const balance = userCredits ?? 0;
                      const disabled =
                        brollGenerating ||
                        brollSelectedPresets.length === 0 ||
                        !brollProductImageUrl ||
                        brollInsufficientCredits;

                      return (
                        <Button
                          className="w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50"
                          disabled={disabled}
                          onClick={() => void handleGenerateBroll()}
                        >
                          {brollGenerating
                            ? "Gerando B-Roll..."
                            : `Generate B-Roll — ~${brollTotalCost} créditos (only ${balance} available)`}
                        </Button>
                      );
                    })()}

                    {brollInsufficientCredits && (
                      <p className="text-xs text-[#FCA5A5]">
                        Créditos insuficientes para os presets selecionados.
                      </p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-[#F5F5F5]">Clipes B-Roll</h3>
                    {normalizeBroll(selectedProject.broll).length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] p-4 text-sm text-[#888888]">
                        Nenhum clipe de B-Roll gerado ainda.
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {normalizeBroll(selectedProject.broll).map((clip) => {
                          const processing = clip.status === "processing";
                          const completed = clip.status === "completed" && clip.result_url;
                          const failed = clip.status === "failed";
                          return (
                            <div key={clip.generation_id} className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-medium text-[#F5F5F5]">
                                  {clip.label || brollPresetLabel(clip.preset)}
                                </p>
                                {processing && (
                                  <span className="inline-flex items-center gap-1 text-xs text-[#A78BFA]">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Gerando
                                  </span>
                                )}
                              </div>

                              {completed ? (
                                <video src={clip.result_url} controls className="w-full rounded-lg" />
                              ) : (
                                <div className="rounded-lg border border-dashed border-[#2A2A2A] bg-[#111111] p-6 text-center text-xs text-[#777777]">
                                  {failed ? "Falhou — tente novamente" : "Processando..."}
                                </div>
                              )}

                              <Button
                                className="mt-2 w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                                disabled={processing}
                                onClick={() => {
                                  setActiveTab("broll");
                                  setBrollSelectedPresets([clip.preset]);
                                  setBrollDuration(
                                    typeof clip.duration === "number" ? clip.duration : 8
                                  );
                                  setBrollAudio(Boolean(clip.audio));
                                }}
                              >
                                {failed ? "Tentar de novo" : "Re-gerar"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      className="border-[#2A2A2A] text-[#F5F5F5]"
                      onClick={() => setActiveTab("avatar")}
                    >
                      ← Back to avatar
                    </Button>
                    <Button
                      variant="outline"
                      className="border-[#2A2A2A] text-[#F5F5F5]"
                      onClick={() => setActiveTab("generations")}
                    >
                      Ver Project Generations →
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "generations" && selectedProject && (
                <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5">
                  <h2 className="text-base font-semibold text-[#F5F5F5]">Project Generations</h2>

                  {completedProjectGenerations.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] p-5 text-sm text-[#888888]">
                      No clips yet — generate your first segment or B-Roll clip.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {completedProjectGenerations.map((item, index) => (
                        <div
                          key={`${item.label}-${item.result_url}-${index}`}
                          className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3"
                        >
                          <p className="mb-2 text-sm font-medium text-[#F5F5F5]">{item.label}</p>
                          <video src={item.result_url} controls className="w-full rounded-lg" />
                          <a
                            href={item.result_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-[#2A2A2A] px-3 py-2 text-sm text-[#F5F5F5] hover:bg-[#202020]"
                            download
                          >
                            Download
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {avatarModal && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2A2A2A] bg-[#131313] p-5 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">Generate: {avatarModal.label}</h3>
            <p className="mt-1 text-sm text-[#888888]">Configure o segmento de talking avatar.</p>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs text-[#A3A3A3]">Fala do avatar</label>
                  {(() => {
                    const words = avatarForm.text.trim() ? avatarForm.text.trim().split(/\s+/).length : 0;
                    const rec = Math.round(avatarForm.duration * 2.75);
                    const lo = Math.round(rec * 0.7);
                    const hi = Math.round(rec * 1.2);
                    const status = words === 0 ? "" : words < lo ? "Muito pouco" : words > hi ? "Muito longo" : "Bom";
                    const color = status === "Bom" ? "text-[#4ADE80]" : status === "" ? "text-[#777777]" : "text-[#FCA5A5]";
                    return (
                      <span className={`text-xs ${color}`}>
                        {words} / ~{rec} palavras{status ? ` · ${status}` : ""} · alvo {avatarForm.duration}s
                      </span>
                    );
                  })()}
                </div>
                <Textarea
                  value={avatarForm.text}
                  onChange={(e) => setAvatarForm(prev => ({ ...prev, text: e.target.value }))}
                  placeholder="Digite o que o avatar vai dizer..."
                  className="min-h-24 border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Accent</label>
                <select
                  value={avatarForm.accent}
                  onChange={(e) => setAvatarForm(prev => ({ ...prev, accent: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 text-sm text-[#F5F5F5] outline-none"
                >
                  {["Accent", "Irish", "Scottish", "French", "German", "Spanish", "Italian"].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs text-[#A3A3A3]">Duração</label>
                <div className="flex gap-2">
                  {([4, 6, 8] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAvatarForm((prev) => ({ ...prev, duration: d }))}
                      className={`flex-1 rounded-lg border py-1.5 text-sm transition ${
                        avatarForm.duration === d
                          ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                          : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[#777777]">⚠ a duração final segue a fala do áudio</p>
              </div>

              <div>
                <label className="mb-2 block text-xs text-[#A3A3A3]">Qualidade</label>
                <div className="flex gap-2">
                  {([
                    { key: "720p", label: "720p · std quality" },
                    { key: "1080p", label: "1080p · pro quality" },
                    { key: "4k", label: "4K · pro quality" },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        setAvatarForm((prev) => ({
                          ...prev,
                          resolution: item.key,
                        }))
                      }
                      className={`flex-1 rounded-lg border py-1.5 text-[11px] transition ${
                        avatarForm.resolution === item.key
                          ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                          : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs text-[#A3A3A3]">Formato</label>
                <div className="flex gap-2">
                  {(["9:16", "1:1", "16:9"] as AvatarFormat[]).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() =>
                        setAvatarForm((prev) => ({
                          ...prev,
                          format,
                        }))
                      }
                      className={`flex-1 rounded-lg border py-1.5 text-sm transition ${
                        avatarForm.format === format
                          ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                          : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                      }`}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAvatarForm(prev => ({ ...prev, cameraAngles: !prev.cameraAngles }))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    avatarForm.cameraAngles ? "bg-[#7C3AED]" : "bg-[#2A2A2A]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      avatarForm.cameraAngles ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-sm text-[#F5F5F5]">Multiple Camera Angles</span>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">
                  Product Image{" "}
                  <span className="text-[#777777]">(opcional — composição em breve)</span>
                </label>
                {avatarForm.productImageUrl && (
                  <div className="mb-2 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#111111]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarForm.productImageUrl}
                      alt="Produto"
                      className="h-24 w-full object-cover"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <ImageDropzone
                    id="ugc-avatar-product-image-drop"
                    disabled={avatarForm.productImageUploading}
                    title={
                      avatarForm.productImageUploading
                        ? "Enviando imagem do produto..."
                        : "Imagem do produto"
                    }
                    subtitle="Arraste e solte ou clique para selecionar"
                    cta={avatarForm.productImageUrl ? "Trocar imagem" : "Enviar imagem"}
                    onFileSelect={(file) => {
                      void handleProductImageUpload(file);
                    }}
                  />
                  {avatarForm.productImageUrl && (
                    <button
                      type="button"
                      className="text-xs text-[#FCA5A5] hover:underline"
                      onClick={() => setAvatarForm((prev) => ({ ...prev, productImageUrl: "" }))}
                    >
                      Remover imagem
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5">
              {(() => {
                const cost = effectiveCostFrontend(
                  avatarSegmentCost(
                    avatarForm.duration,
                    avatarForm.resolution,
                    avatarForm.format
                  )
                );
                const balance = userCredits ?? 0;
                const insufficient = balance < cost;
                return (
                  <Button
                    className="w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50"
                    disabled={avatarGenerating || insufficient || !avatarForm.text.trim()}
                    onClick={() => void handleGenerateSegment()}
                  >
                    {avatarGenerating ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</>
                    ) : insufficient ? (
                      `Créditos insuficientes (precisa ${cost}, tem ${balance})`
                    ) : (
                      `Generate Talking Avatar — ~${cost} créditos (only ${balance} available)`
                    )}
                  </Button>
                );
              })()}
            </div>

            <p className="mt-2 text-center text-xs text-[#777777]">
              Results may vary — you might need to trim or re-generate for the perfect take.
            </p>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                disabled={avatarGenerating}
                onClick={() => setAvatarModal(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {projectCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2A2A2A] bg-[#131313] p-5">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">New UGC Project</h3>
            <p className="mt-1 text-sm text-[#888888]">
              Crie um projeto para organizar roteiro, avatar e b-roll.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Nome do projeto *</label>
                <Input
                  value={projectForm.name}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ex.: UGC Hidratante Vitamina C"
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Produto relacionado</label>
                <select
                  value={projectProductId}
                  onChange={(e) => setProjectProductId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 text-sm text-[#F5F5F5] outline-none"
                >
                  <option value="">Nenhum</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Avatar label (opcional)</label>
                <Input
                  value={projectForm.description}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Ex.: Criadora 27 anos, tom amigável"
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                onClick={() => {
                  if (!projectSaving) {
                    setProjectCreateOpen(false);
                    setProjectForm(emptyProjectForm());
                    setProjectProductId("");
                  }
                }}
                disabled={projectSaving}
              >
                Cancelar
              </Button>
              <Button
                className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                onClick={() => void handleCreateProject()}
                disabled={projectSaving}
              >
                {projectSaving ? "Criando..." : "Criar projeto"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2A2A2A] bg-[#131313] p-5">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">
              {editing ? "Editar produto" : "Adicionar produto"}
            </h3>
            <p className="mt-1 text-sm text-[#888888]">
              Faça upload da imagem e preencha os dados do produto.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Imagem do produto *</label>
                {form.imageUrl && (
                  <div className="mb-2 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.imageUrl}
                      alt="Preview do produto"
                      className="h-32 w-full object-cover"
                    />
                  </div>
                )}
                <ImageDropzone
                  id="ugc-product-drop"
                  disabled={uploading || saving}
                  title={uploading ? "Enviando imagem..." : "Imagem do produto"}
                  subtitle="Arraste e solte ou clique para selecionar"
                  cta={form.imageUrl ? "Trocar imagem" : "Enviar imagem"}
                  onFileSelect={(file) => {
                    void handleUploadImage(file);
                  }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Título *</label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Ex.: Hidratante Facial Glow"
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#A3A3A3]">Descrição</label>
                <Textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Ex.: Benefícios, diferenciais e público-alvo"
                  className="min-h-24 border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                onClick={closeEditor}
                disabled={saving || uploading}
              >
                Cancelar
              </Button>
              <Button
                className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                onClick={() => void handleSaveProduct()}
                disabled={saving || uploading}
              >
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar produto"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteOpen && pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2A2A2A] bg-[#131313] p-5">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">Excluir produto</h3>
            <p className="mt-1 text-sm text-[#888888]">
              Tem certeza que deseja excluir <strong>{pendingDelete.title}</strong>? Esta ação não pode ser desfeita.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                onClick={closeDeleteDialog}
                disabled={workingId === pendingDelete.id}
              >
                Cancelar
              </Button>
              <Button
                variant="outline"
                className="border-[#3A1F1F] text-[#FCA5A5] hover:bg-[#2A1313]"
                onClick={() => void handleDeleteProduct()}
                disabled={workingId === pendingDelete.id}
              >
                {workingId === pendingDelete.id ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
