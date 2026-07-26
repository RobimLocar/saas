"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Pencil, Plus, Trash2, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type ViewMode = "list" | "project";
type UgcTab = "script" | "avatar" | "broll";

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

function avatarSegmentCost(duration: number): number {
  return Math.ceil(14 + 3.75 * duration);
}

function effectiveCostFrontend(base: number, plan: string): number {
  return plan === "free" ? Math.ceil(base * 2) : base;
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
    cameraAngles: false,
    productImageUrl: "",
    productImageUploading: false,
  });
  const [avatarGenerating, setAvatarGenerating] = useState(false);
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [pollingSegments, setPollingSegments] = useState<Record<string, string>>({});

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

      const project = data?.project as UgcProject;
      setSelectedProject(project);
      setScriptDraft(normalizeScript(project?.script));
      setScriptProductId(project?.product_id || "");
      setNameDraft(project?.name || "");
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
        setUserPlan(data?.plan ?? "free");
      }
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadProjects();
    void loadMe();
  }, [loadProducts, loadProjects, loadMe]);

  useEffect(() => {
    if (view !== "project" || !selectedProjectId) return;
    void loadProject(selectedProjectId);
  }, [view, selectedProjectId, loadProject]);

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
    setAvatarForm(prev => ({ ...prev, productImageUploading: true }));
    const toastId = toast.loading("Enviando imagem do produto...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Erro no upload.");
      setAvatarForm(prev => ({ ...prev, productImageUrl: data.url }));
      toast.success("Imagem do produto enviada.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar imagem.", { id: toastId });
    } finally {
      setAvatarForm(prev => ({ ...prev, productImageUploading: false }));
    }
  }

  async function handleGenerateSegment() {
    if (!selectedProject || !avatarModal) return;
    setAvatarGenerating(true);
    const toastId = toast.loading(`Gerando ${avatarModal.label}...`);
    try {
      const res = await fetch(`/api/ugc/projects/${selectedProject.id}/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_key: avatarModal.segmentKey,
          text: avatarForm.text,
          accent: avatarForm.accent,
          duration: avatarForm.duration,
          resolution: avatarForm.resolution,
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
              accent: avatarForm.accent,
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
            setPollingSegments(prev => {
              const next = { ...prev };
              delete next[key];
              return next;
            });

            setSelectedProject(prev => {
              if (!prev) return prev;
              const segs = (prev.segments as Record<string, unknown> | null) ?? {};
              const seg = (segs[key] as Record<string, unknown>) ?? {};
              const segResultUrl =
                typeof seg.result_url === "string" ? seg.result_url : null;

              return {
                ...prev,
                segments: {
                  ...segs,
                  [key]: {
                    ...seg,
                    status: data.status,
                    result_url: data.result_url ?? segResultUrl,
                  },
                },
              };
            });

            if (data?.status === "completed") {
              toast.success(`Segmento ${key} concluído!`);
              void loadMe();
            }
          }
        } catch {
          // ignorar erros de polling
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingSegments, loadMe]);

  const hasScript = Boolean(
    scriptDraft.hook.text ||
      scriptDraft.body1.text ||
      scriptDraft.body2.text ||
      scriptDraft.cta.text
  );

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

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                    disabled
                    className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-left text-[#777777]"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">B-Roll</p>
                      <Badge className="bg-[#2A2A2A] text-[#888888]">Próxima etapa</Badge>
                    </div>
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
                    {selectedProject.avatar_image_url ? (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedProject.avatar_image_url}
                          alt="Avatar"
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                        <div>
                          <p className="text-sm text-[#F5F5F5]">Retrato configurado</p>
                          <label className="mt-1 cursor-pointer text-xs text-[#7C3AED] hover:underline">
                            Trocar retrato
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={avatarUploading}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleAvatarPortraitUpload(file);
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <p className="text-sm text-[#888888]">Nenhum retrato configurado ainda.</p>
                        <p className="text-xs text-[#777777]">Faça upload de um retrato para começar.</p>
                        <label className="cursor-pointer">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-sm text-white hover:bg-[#6D28D9]">
                            {avatarUploading ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                            ) : (
                              "Enviar retrato"
                            )}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={avatarUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleAvatarPortraitUpload(file);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    )}
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
                                    setAvatarModal({ segmentKey: key, label, defaultText: scriptText });
                                    setAvatarForm(prev => ({
                                      ...prev,
                                      text: scriptText,
                                    }));
                                  }}
                                >
                                  Re-gerar
                                </Button>
                              </div>
                            ) : (
                              <>
                                <p className="mb-2 line-clamp-2 text-xs text-[#888888]">
                                  {scriptText || "Sem texto no roteiro"}
                                </p>
                                <Button
                                  className="w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                                  disabled={isProcessing}
                                  onClick={() => {
                                    setAvatarModal({ segmentKey: key, label, defaultText: scriptText });
                                    setAvatarForm(prev => ({
                                      ...prev,
                                      text: scriptText,
                                      productImageUrl: "",
                                    }));
                                  }}
                                >
                                  {isProcessing ? (
                                    <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Gerando...</>
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
                      disabled
                      className="border-[#2A2A2A] text-[#777777]"
                    >
                      Next: B-Roll Studio →
                    </Button>
                  </div>
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
                  {([4, 6, 8] as const).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAvatarForm(prev => ({ ...prev, duration: d }))}
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
              </div>

              <div>
                <label className="mb-2 block text-xs text-[#A3A3A3]">Resolução</label>
                <div className="flex gap-2">
                  {(["720p", "1080p", "4k"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAvatarForm(prev => ({ ...prev, resolution: r }))}
                      className={`flex-1 rounded-lg border py-1.5 text-sm transition ${
                        avatarForm.resolution === r
                          ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                          : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                      }`}
                    >
                      {r.toUpperCase()}
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
                {avatarForm.productImageUrl ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarForm.productImageUrl}
                      alt="Produto"
                      className="h-10 w-10 rounded object-cover"
                    />
                    <button
                      type="button"
                      className="text-xs text-[#FCA5A5] hover:underline"
                      onClick={() => setAvatarForm(prev => ({ ...prev, productImageUrl: "" }))}
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-sm text-[#BDBDBD] hover:border-[#7C3AED]/40">
                      {avatarForm.productImageUploading ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Enviando...</>
                      ) : (
                        "Enviar imagem do produto"
                      )}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={avatarForm.productImageUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleProductImageUpload(file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="mt-5">
              {(() => {
                const cost = effectiveCostFrontend(avatarSegmentCost(avatarForm.duration), userPlan);
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
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading || saving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void handleUploadImage(file);
                    event.currentTarget.value = "";
                  }}
                  className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                />
                {form.imageUrl && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#1A1A1A]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.imageUrl}
                      alt="Preview do produto"
                      className="h-32 w-full object-cover"
                    />
                  </div>
                )}
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
