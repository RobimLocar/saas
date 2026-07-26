"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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

function emptyForm(): ProductFormState {
  return {
    title: "",
    description: "",
    imageUrl: "",
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

export default function UGCPage() {
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

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

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

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#F5F5F5]">UGC Factory</h1>
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

      <section className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5 opacity-70">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Gerador de vídeos UGC — Em breve (4c-2)</h2>
          <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">Em breve</Badge>
        </div>
        <p className="mt-2 text-sm text-[#888888]">
          Selecione um produto, escolha um modelo de UGC e gere dezenas de vídeos automaticamente.
        </p>
      </section>

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
