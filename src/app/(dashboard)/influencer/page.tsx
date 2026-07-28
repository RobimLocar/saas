"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, User, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GenerationCard } from "@/components/ui/generation-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CONTENT_PRESETS,
  buildContentPrompt,
  buildPersonaDescription,
} from "@/lib/influencer-content-presets";

type GenderOption = "Female" | "Male" | "Non-binary";
type AgeOption =
  | "18-24"
  | "25-34"
  | "35-44"
  | "45-55"
  | "56-65"
  | "66-75"
  | "76-85";

interface InfluencerItem {
  id: string;
  name: string;
  handle: string | null;
  gender: string | null;
  age_range: string | null;
  styles: string[] | null;
  hair_color: string | null;
  eye_color: string | null;
  additional_details: string | null;
  reference_image_urls: string[] | null;
  variations: string[] | null;
  avatar_image_url: string | null;
  status: "draft" | "active" | null;
  created_at: string;
  updated_at: string | null;
}

interface InfluencerContentItem {
  id: string;
  influencer_id: string;
  user_id: string;
  category: string;
  prompt: string;
  image_url: string | null;
  generation_id: string | null;
  caption: string | null;
  format: "9:16" | "1:1" | "16:9" | string;
  created_at: string;
}

const GENDERS: GenderOption[] = ["Female", "Male", "Non-binary"];
const AGES: AgeOption[] = ["18-24", "25-34", "35-44", "45-55", "56-65", "66-75", "76-85"];

const STYLES = [
  "Luxury",
  "Lifestyle",
  "Fitness",
  "Casual",
  "Streetwear",
  "Artistic",
  "Corporate",
  "Soft Girl",
  "Edgy",
  "Minimalist",
] as const;

const HAIR_COLORS = [
  "Blonde",
  "Brunette",
  "Black",
  "Red",
  "Auburn",
  "Gray",
  "White",
  "Silver",
  "Brown",
  "Chestnut",
  "Golden",
  "Platinum",
  "Dark Brown",
  "Copper",
  "Balayage",
] as const;

const EYE_COLORS = ["Brown", "Blue", "Green", "Hazel", "Gray", "Amber", "Black", "Violet"] as const;

const PREMADES = [
  {
    title: "The Lifestyle Guru",
    values: {
      gender: "Female",
      age_range: "25-34",
      styles: ["Lifestyle", "Casual"],
      hair_color: "Blonde",
      eye_color: "Blue",
      additional_details: "natural smile, confident posture",
    },
  },
  {
    title: "The Fitness Coach",
    values: {
      gender: "Male",
      age_range: "25-34",
      styles: ["Fitness", "Lifestyle"],
      hair_color: "Brown",
      eye_color: "Brown",
      additional_details: "athletic look, energetic expression",
    },
  },
  {
    title: "The Luxury Influencer",
    values: {
      gender: "Female",
      age_range: "35-44",
      styles: ["Luxury", "Corporate"],
      hair_color: "Brunette",
      eye_color: "Hazel",
      additional_details: "elegant makeup, premium editorial vibe",
    },
  },
  {
    title: "The Streetwear Artist",
    values: {
      gender: "Male",
      age_range: "18-24",
      styles: ["Streetwear", "Artistic"],
      hair_color: "Black",
      eye_color: "Brown",
      additional_details: "creative attitude, urban aesthetics",
    },
  },
] as const;

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T | "";
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              active
                ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function MultiSelectChips({
  options,
  values,
  onToggle,
}: {
  options: readonly string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = values.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              active
                ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Dropzone({
  disabled,
  onFiles,
  label,
  uploading,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  uploading?: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`block rounded-2xl border-2 border-dashed bg-[#111111] p-8 text-center transition-all duration-200 ${
        dragging
          ? "border-[#7C3AED] bg-[#7C3AED]/5"
          : "border-[#2A2A2A] hover:border-[#7C3AED]/60"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFiles(files);
      }}
    >
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.currentTarget.value = "";
        }}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Sparkles className="h-6 w-6 animate-spin text-[#A78BFA]" />
          <p className="text-sm text-[#888888]">Enviando…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className={`h-8 w-8 ${dragging ? "text-[#7C3AED]" : "text-[#888888]"}`} />
          <p className="text-sm font-medium text-[#F5F5F5]">{label}</p>
          <p className="text-xs text-[#888888]">Arraste e solte ou clique para selecionar</p>
        </div>
      )}
    </label>
  );
}

export default function InfluencerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null);
  const [activePersonaTab, setActivePersonaTab] = useState<"feed" | "presets" | "captions">("feed");

  const [createOpen, setCreateOpen] = useState(false);
  const [premadeOpen, setPremadeOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const [name, setName] = useState("");
  const [gender, setGender] = useState<GenderOption | "">("");
  const [ageRange, setAgeRange] = useState<AgeOption | "">("");
  const [styles, setStyles] = useState<string[]>([]);
  const [hairColor, setHairColor] = useState<string>("");
  const [eyeColor, setEyeColor] = useState<string>("");
  const [additionalDetails, setAdditionalDetails] = useState("");

  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [uploadingRefs, setUploadingRefs] = useState(false);

  const [draftInfluencerId, setDraftInfluencerId] = useState<string | null>(null);
  const [variations, setVariations] = useState<string[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<string>("");

  const [userCredits, setUserCredits] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);

  const [feedLoading, setFeedLoading] = useState(false);
  const [contentItems, setContentItems] = useState<InfluencerContentItem[]>([]);
  const [saveSeedLoadingId, setSaveSeedLoadingId] = useState<string | null>(null);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [quickCount, setQuickCount] = useState(4);
  const [quickFormat, setQuickFormat] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [quickGenerating, setQuickGenerating] = useState(false);
  const [quickUnitCost, setQuickUnitCost] = useState(0);

  const [captionTargetId, setCaptionTargetId] = useState<string>("");
  const [captionFreePrompt, setCaptionFreePrompt] = useState("");
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionOptions, setCaptionOptions] = useState<string[]>([]);
  const [chosenCaption, setChosenCaption] = useState<string>("");
  const [savingCaption, setSavingCaption] = useState(false);

  const selectedInfluencer = useMemo(
    () => influencers.find((x) => x.id === selectedInfluencerId) || null,
    [influencers, selectedInfluencerId]
  );

  const canGenerate =
    name.trim().length > 0 &&
    Boolean(gender) &&
    Boolean(ageRange) &&
    styles.length > 0 &&
    hairColor.trim().length > 0 &&
    eyeColor.trim().length > 0;

  const quickTotalCost = quickUnitCost * quickCount;
  const quickBlockedByCredits = quickTotalCost > userCredits;

  const selectedContentForCaptions = useMemo(
    () => contentItems.find((item) => item.id === captionTargetId) || null,
    [contentItems, captionTargetId]
  );

  async function loadInfluencers() {
    setLoading(true);
    try {
      const res = await fetch("/api/influencers", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar personas.");
      const list = Array.isArray(data?.influencers) ? data.influencers : [];
      setInfluencers(list);
      if (!selectedInfluencerId && list[0]?.id) {
        setSelectedInfluencerId(list[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar personas.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMe() {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      setUserCredits(Number(data?.credits || 0));
    } catch {
      // noop
    }
  }

  async function loadEstimatedCost() {
    try {
      const res = await fetch("/api/models?type=image", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      const models = Array.isArray(data?.models) ? data.models : [];

      const createModel =
        models.find((m: { model_id?: string }) => m.model_id === "gpt-image-2") ||
        models.find((m: { model_id?: string }) => m.model_id === "nano-banana-pro") ||
        models[0];
      const createUnit = Number(createModel?.credit_cost || 0);
      setEstimatedCost(createUnit * 4);

      const quickModel =
        models.find((m: { model_id?: string }) => m.model_id === "nano-banana-pro") ||
        models.find((m: { name?: string }) =>
          typeof m.name === "string" && /nano banana pro/i.test(m.name)
        ) ||
        createModel;
      setQuickUnitCost(Number(quickModel?.credit_cost || 0));
    } catch {
      // noop
    }
  }

  useEffect(() => {
    void loadInfluencers();
    void loadMe();
    void loadEstimatedCost();
  }, []);

  async function loadContentItems(influencerId: string) {
    setFeedLoading(true);
    try {
      const res = await fetch(`/api/influencers/${influencerId}/content`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar feed.");
      setContentItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar feed.");
      setContentItems([]);
    } finally {
      setFeedLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedInfluencerId) {
      setContentItems([]);
      return;
    }
    void loadContentItems(selectedInfluencerId);
    setCaptionTargetId("");
    setCaptionOptions([]);
    setChosenCaption("");
  }, [selectedInfluencerId]);

  function toggleCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((x) => x !== category) : [...prev, category]
    );
  }

  async function handleQuickGenerate() {
    if (!selectedInfluencer) return;
    if (selectedCategories.length === 0) {
      toast.error("Selecione ao menos 1 categoria.");
      return;
    }

    const estimated = quickUnitCost * quickCount;
    if (estimated > userCredits) {
      toast.error("Créditos insuficientes para gerar este pack.");
      return;
    }

    if (!selectedInfluencer.avatar_image_url) {
      toast.error("Influencer draft — selecione avatar antes de gerar conteúdo.");
      return;
    }

    setQuickGenerating(true);
    const toastId = toast.loading("Gerando pack de conteúdo...");
    try {
      const res = await fetch(`/api/influencers/${selectedInfluencer.id}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selectedCategories,
          count: quickCount,
          format: quickFormat,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao gerar conteúdo.");

      const items = Array.isArray(data?.items) ? (data.items as InfluencerContentItem[]) : [];
      setContentItems((prev) => [...items, ...prev]);
      setActivePersonaTab("feed");
      void loadMe();

      toast.success(`${items.length} conteúdo(s) gerado(s)!`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar conteúdo.", {
        id: toastId,
      });
    } finally {
      setQuickGenerating(false);
    }
  }

  async function handleSaveAsSeed(item: InfluencerContentItem) {
    if (!item.image_url) return;
    setSaveSeedLoadingId(item.id);
    try {
      const categoryName =
        CONTENT_PRESETS.find((x) => x.key === item.category)?.label || item.category;
      const res = await fetch("/api/seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${selectedInfluencer?.name || "Influencer"} · ${categoryName}`,
          description: item.prompt,
          preview_url: item.image_url,
          tags: ["influencer", item.category],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar seed.");
      toast.success("Seed salva com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar seed.");
    } finally {
      setSaveSeedLoadingId(null);
    }
  }

  async function handleCopyPromptForStudio(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copiado.");
    } catch {
      toast.error("Não foi possível copiar o prompt.");
    }
  }

  function handleUseSceneInStudio(scene: string) {
    if (!selectedInfluencer) return;
    const persona = buildPersonaDescription(selectedInfluencer);
    const prompt = buildContentPrompt(persona, scene);
    router.push(`/studio?prompt=${encodeURIComponent(prompt)}`);
  }

  async function handleGenerateCaptions() {
    if (!selectedInfluencer) return;
    if (!captionTargetId && !captionFreePrompt.trim()) {
      toast.error("Selecione um item do feed ou informe um prompt livre.");
      return;
    }

    setCaptionLoading(true);
    const toastId = toast.loading("Gerando legendas...");

    try {
      const res = await fetch(`/api/influencers/${selectedInfluencer.id}/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_id: captionTargetId || undefined,
          prompt: captionTargetId ? undefined : captionFreePrompt,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao gerar legendas.");

      const captions = Array.isArray(data?.captions) ? data.captions : [];
      setCaptionOptions(captions);
      setChosenCaption(captions[0] || "");
      toast.success("Legendas geradas.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar legendas.", { id: toastId });
    } finally {
      setCaptionLoading(false);
    }
  }

  async function handleUseCaption(caption: string) {
    setChosenCaption(caption);
    try {
      await navigator.clipboard.writeText(caption);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar a legenda.");
    }
  }

  async function handleSaveCaption(captionOverride?: string) {
    const captionToSave = (captionOverride ?? chosenCaption).trim();
    if (!selectedInfluencer || !captionTargetId || !captionToSave) {
      toast.error("Selecione um item do feed e uma legenda para salvar.");
      return;
    }

    setSavingCaption(true);
    const toastId = toast.loading("Salvando legenda...");
    try {
      const res = await fetch(`/api/influencers/${selectedInfluencer.id}/captions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_id: captionTargetId,
          caption: captionToSave,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar legenda.");

      setContentItems((prev) =>
        prev.map((item) => (item.id === captionTargetId ? { ...item, caption: captionToSave } : item))
      );
      toast.success("Legenda salva no item.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar legenda.", { id: toastId });
    } finally {
      setSavingCaption(false);
    }
  }

  function resetCreateState() {
    setName("");
    setGender("");
    setAgeRange("");
    setStyles([]);
    setHairColor("");
    setEyeColor("");
    setAdditionalDetails("");
    setReferenceImageUrls([]);
    setDraftInfluencerId(null);
    setVariations([]);
    setSelectedVariation("");
    setGenProgress(0);
  }

  function hydrateFormFromInfluencer(inf: InfluencerItem) {
    setName(inf.name || "");
    setGender((inf.gender as GenderOption | null) || "");
    setAgeRange((inf.age_range as AgeOption | null) || "");
    setStyles(Array.isArray(inf.styles) ? inf.styles : []);
    setHairColor(inf.hair_color || "");
    setEyeColor(inf.eye_color || "");
    setAdditionalDetails(inf.additional_details || "");
    setReferenceImageUrls(Array.isArray(inf.reference_image_urls) ? inf.reference_image_urls : []);
  }

  function openCreateModal() {
    setCreateOpen(true);
    setPremadeOpen(false);
    resetCreateState();
  }

  function openDraftChooser(inf: InfluencerItem) {
    hydrateFormFromInfluencer(inf);
    const vars = Array.isArray(inf.variations) ? inf.variations : [];
    setDraftInfluencerId(inf.id);
    setVariations(vars);
    setSelectedVariation(inf.avatar_image_url || vars[0] || "");
    setPremadeOpen(false);
    setCreateOpen(true);
  }

  function applyPremade(index: number) {
    const premade = PREMADES[index];
    if (!premade) return;
    setName(premade.title);
    setGender(premade.values.gender as GenderOption);
    setAgeRange(premade.values.age_range as AgeOption);
    setStyles([...premade.values.styles]);
    setHairColor(premade.values.hair_color);
    setEyeColor(premade.values.eye_color);
    setAdditionalDetails(premade.values.additional_details);
    setReferenceImageUrls([]);
    setDraftInfluencerId(null);
    setVariations([]);
    setSelectedVariation("");
    setPremadeOpen(false);
    setCreateOpen(true);
  }

  function toggleStyle(style: string) {
    setStyles((prev) =>
      prev.includes(style) ? prev.filter((x) => x !== style) : [...prev, style]
    );
  }

  async function uploadReferences(files: File[]) {
    if (files.length === 0) return;
    if (referenceImageUrls.length >= 8) {
      toast.error("Limite de 8 imagens de referência atingido.");
      return;
    }

    setUploadingRefs(true);
    try {
      const nextUrls = [...referenceImageUrls];
      const allowed = files.slice(0, Math.max(0, 8 - referenceImageUrls.length));

      for (const file of allowed) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || "Falha no upload da referência.");
        }
        nextUrls.push(data.url as string);
      }

      setReferenceImageUrls(nextUrls);
      toast.success("Referências enviadas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload de referência.");
    } finally {
      setUploadingRefs(false);
    }
  }

  async function handleGenerate(existingInfluencerId?: string) {
    if (!canGenerate || generating) return;
    setGenerating(true);
    setGenProgress(0);
    const toastId = toast.loading("Generating your influencer...");

    const timer = window.setInterval(() => {
      setGenProgress((prev) => Math.min(prev + 1, 3));
    }, 2000);

    try {
      const res = await fetch("/api/influencers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: existingInfluencerId || draftInfluencerId || undefined,
          name,
          gender,
          age_range: ageRange,
          styles,
          hair_color: hairColor,
          eye_color: eyeColor,
          additional_details: additionalDetails || null,
          reference_image_urls: referenceImageUrls,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao gerar candidatos.");
      }

      const vars = Array.isArray(data?.variations) ? data.variations : [];
      if (vars.length === 0) {
        throw new Error("Nenhum candidato foi gerado com sucesso.");
      }

      setGenProgress(4);
      setDraftInfluencerId(data.influencer_id as string);
      setVariations(vars);
      setSelectedVariation(vars[0] || "");
      void loadInfluencers();
      void loadMe();

      const failedCount = Number(data?.failed_count || 0);
      if (failedCount > 0) {
        toast.success(
          `Candidatos gerados com falha parcial (${vars.length} sucesso, ${failedCount} falha). Escolha seu avatar.`,
          { id: toastId }
        );
      } else {
        toast.success("Candidatos gerados! Escolha seu avatar.", { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar influencer.", {
        id: toastId,
      });
    } finally {
      window.clearInterval(timer);
      setGenerating(false);
    }
  }

  async function handleConfirmCreate() {
    if (!draftInfluencerId || !selectedVariation) {
      toast.error("Selecione um avatar antes de confirmar.");
      return;
    }

    setConfirming(true);
    const toastId = toast.loading("Confirmando influencer...");

    try {
      const res = await fetch(`/api/influencers/${draftInfluencerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          avatar_image_url: selectedVariation,
          status: "active",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao confirmar influencer.");

      toast.success("Influencer criado com sucesso!", { id: toastId });
      setCreateOpen(false);
      resetCreateState();
      await loadInfluencers();
      await loadMe();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar influencer.", {
        id: toastId,
      });
    } finally {
      setConfirming(false);
    }
  }

  async function handleRegenerate() {
    if (!draftInfluencerId) {
      toast.error("Influencer draft não encontrado para regenerar.");
      return;
    }
    setVariations([]);
    setSelectedVariation("");
    await handleGenerate(draftInfluencerId);
  }

  async function handleDeleteInfluencer(id: string) {
    const confirmed = window.confirm("Deseja remover esta persona?");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/influencers/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao remover persona.");

      const next = influencers.filter((x) => x.id !== id);
      setInfluencers(next);
      if (selectedInfluencerId === id) {
        setSelectedInfluencerId(next[0]?.id || null);
      }
      toast.success("Persona removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover persona.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-[#242428] p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-[#1b1030] via-[#141416] to-[#0f0f11]" />
        <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-[#7C3AED]/25 blur-[110px]" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Your very own influencer studio</h1>
            <p className="mt-2 text-sm text-[#b8b8c0]">
              Crie personas de IA consistentes, gere conteúdo ilimitado e veja o engajamento explodir.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-[#2A2A2A] bg-white/5 text-[#F5F5F5] hover:bg-white/10"
              onClick={() => setPremadeOpen(true)}
            >
              <Users className="mr-2 h-4 w-4" />
              Choose Premade
            </Button>
            <Button
              className="bg-white text-black hover:bg-white/90"
              onClick={openCreateModal}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create Influencer
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F5]">My Influencers</h2>
            <p className="text-sm text-[#888888]">
              {influencers.length > 0
                ? `${influencers.length} persona${influencers.length === 1 ? "" : "s"} criada${influencers.length === 1 ? "" : "s"}`
                : "Suas personas criadas"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5 text-sm text-[#888888]">
            Carregando personas...
          </div>
        ) : influencers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2A2A2A] bg-[#141414] px-4">
            <EmptyState
              icon={Users}
              title="Nenhuma persona ainda"
              description="Comece com um premade ou crie do zero para ativar seu estúdio de conteúdo."
              action={{ label: "Create Influencer", onClick: openCreateModal }}
            />
          </div>
        ) : (
          <div className="fx-scroll flex gap-4 overflow-x-auto pb-2">
            {influencers.map((inf) => {
              const active = inf.id === selectedInfluencerId;
              const status = inf.avatar_image_url ? "active" : (inf.status || "draft");
              const statusRaw = String(status).toLowerCase();
              const statusClass =
                statusRaw === "active" || statusRaw === "ready"
                  ? "bg-[#7C3AED]/15 text-[#A78BFA]"
                  : statusRaw === "processing"
                    ? "bg-blue-500/15 text-blue-300"
                    : "bg-amber-500/15 text-amber-300";

              return (
                <div
                  key={inf.id}
                  onClick={() => {
                    if (!inf.avatar_image_url) {
                      openDraftChooser(inf);
                      return;
                    }
                    setSelectedInfluencerId(inf.id);
                    setActivePersonaTab("feed");
                  }}
                  className={`group relative aspect-[3/4] w-[210px] shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-[#1A1A1A] text-left ring-1 transition-all duration-200 ${
                    active
                      ? "ring-2 ring-[#7C3AED] shadow-[0_0_20px_rgba(124,58,237,0.25)]"
                      : "ring-white/5 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(124,58,237,0.15)] hover:ring-[#7C3AED]/25"
                  }`}
                >
                  {inf.avatar_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inf.avatar_image_url}
                      alt={inf.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7C3AED]/10">
                        <User className="h-6 w-6 text-[#7C3AED]" />
                      </div>
                      <p className="text-xs text-[#8b8b93]">Escolha um avatar</p>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDraftChooser(inf);
                        }}
                        className="text-xs text-[#7C3AED] underline transition-colors hover:text-[#8B5CF6]"
                      >
                        Finalizar
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="absolute right-2 top-2 z-20 rounded-lg bg-black/60 p-1.5 text-xs text-red-400 opacity-0 transition-opacity duration-200 hover:bg-black/80 hover:text-red-300 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteInfluencer(inf.id);
                    }}
                  >
                    Excluir
                  </button>

                  {inf.avatar_image_url && (
                    <span className={`absolute left-2 top-2 z-10 rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${statusClass}`}>
                      {status.toUpperCase()}
                    </span>
                  )}

                  {inf.avatar_image_url && (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="line-clamp-1 text-sm font-semibold text-white">{inf.name}</p>
                        <p className="line-clamp-1 text-xs text-white/70">{inf.handle || "@sem_handle"}</p>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedInfluencer && (
        <section className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              ["feed", "Feed"],
              ["presets", "Presets"],
              ["captions", "Captions"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivePersonaTab(key)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  activePersonaTab === key
                    ? "border-[#7C3AED] bg-[#7C3AED]/10 text-[#F5F5F5]"
                    : "border-[#2A2A2A] bg-[#1A1A1A] text-[#BDBDBD]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activePersonaTab === "feed" && (
            <div>
              {feedLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="h-56 animate-pulse rounded-lg border border-[#2A2A2A] bg-[#1D1D1D]" />
                  ))}
                </div>
              ) : contentItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] px-4">
                  <EmptyState
                    icon={Sparkles}
                    title="Nenhum conteúdo gerado ainda"
                    description="Vá para Presets para criar seu primeiro pack da persona selecionada."
                    action={{ label: "Abrir Presets", onClick: () => setActivePersonaTab("presets") }}
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {contentItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">{item.category}</Badge>
                        <span className="text-[11px] text-[#777777]">{item.format || "9:16"}</span>
                      </div>

                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.category} className="h-56 w-full rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-[#2A2A2A] text-xs text-[#888888]">
                          Sem imagem
                        </div>
                      )}

                      {item.caption && (
                        <p className="mt-2 line-clamp-2 text-xs text-[#A3A3A3]">{item.caption}</p>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <a
                          href={item.image_url || "#"}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-md border border-[#2A2A2A] px-3 py-2 text-xs text-[#F5F5F5] hover:bg-[#202020]"
                        >
                          Download
                        </a>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-[#2A2A2A] text-[#F5F5F5]"
                          disabled={!item.image_url || saveSeedLoadingId === item.id}
                          onClick={() => {
                            void handleSaveAsSeed(item);
                          }}
                        >
                          {saveSeedLoadingId === item.id ? "Salvando..." : "Salvar como Seed"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activePersonaTab === "presets" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#242428] bg-[#101012] p-4">
                <h3 className="text-sm font-semibold text-[#F5F5F5]">Quick Generate</h3>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {CONTENT_PRESETS.map((preset) => {
                    const active = selectedCategories.includes(preset.key);
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => toggleCategory(preset.key)}
                        className={`rounded-lg border p-3 text-left transition ${
                          active
                            ? "border-[#7C3AED] bg-[#7C3AED]/10"
                            : "border-[#2A2A2A] bg-[#161616] hover:border-[#7C3AED]/50"
                        }`}
                      >
                        <p className="text-sm font-medium text-[#F5F5F5]">
                          {preset.icon} {preset.label}
                        </p>
                        <p className="mt-1 text-[11px] text-[#888888]">{preset.scenes.length} cenas</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[#A3A3A3]">Quantidade: {quickCount}</label>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={quickCount}
                      onChange={(e) => setQuickCount(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#A3A3A3]">Formato</label>
                    <div className="flex gap-2">
                      {(["9:16", "1:1", "16:9"] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setQuickFormat(fmt)}
                          className={`flex-1 rounded-lg border py-1.5 text-sm transition ${
                            quickFormat === fmt
                              ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#F5F5F5]"
                              : "border-[#2A2A2A] bg-[#161616] text-[#BDBDBD]"
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    type="button"
                    className="w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50"
                    disabled={
                      quickGenerating ||
                      selectedCategories.length === 0 ||
                      quickBlockedByCredits ||
                      !selectedInfluencer.avatar_image_url
                    }
                    onClick={() => {
                      void handleQuickGenerate();
                    }}
                  >
                    {quickGenerating
                      ? "Gerando..."
                      : `Generate ${quickCount} Images — ~${quickTotalCost} créditos (only ${userCredits} available)`}
                  </Button>
                  {quickBlockedByCredits && (
                    <p className="mt-1 text-xs text-[#FCA5A5]">Créditos insuficientes para este pack.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#242428] bg-[#101012] p-4">
                <h3 className="text-sm font-semibold text-[#F5F5F5]">Prompt Library</h3>
                <div className="mt-4 space-y-5">
                  {CONTENT_PRESETS.map((preset) => (
                    <div key={`library-${preset.key}`}>
                      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#8b8b93]">
                        <span>{preset.icon}</span>
                        {preset.label}
                      </p>
                      <div className="space-y-0.5">
                        {preset.scenes.map((scene) => {
                          const fullPrompt = buildContentPrompt(
                            buildPersonaDescription(selectedInfluencer),
                            scene
                          );
                          return (
                            <div
                              key={`${preset.key}-${scene}`}
                              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                            >
                              <p className="min-w-0 flex-1 truncate text-xs text-[#BDBDBD]">{scene}</p>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleCopyPromptForStudio(fullPrompt);
                                  }}
                                  className="rounded-md border border-[#2A2A2A] bg-white/5 px-2.5 py-1 text-[11px] text-[#d0d0d0] transition-colors hover:bg-white/10"
                                >
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUseSceneInStudio(scene)}
                                  className="rounded-md bg-[#7C3AED]/15 px-2.5 py-1 text-[11px] font-medium text-[#A78BFA] transition-colors hover:bg-[#7C3AED]/25"
                                >
                                  Usar no Studio
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activePersonaTab === "captions" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#242428] bg-[#101012] p-4">
                <h3 className="text-sm font-semibold text-[#F5F5F5]">Gerar legendas</h3>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-[#A3A3A3]">Gerar para item do feed</label>
                    <select
                      value={captionTargetId}
                      onChange={(e) => setCaptionTargetId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#2A2A2A] bg-[#151515] px-2 text-sm text-[#F5F5F5]"
                    >
                      <option value="">Nenhum (usar prompt livre)</option>
                      {contentItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.category} • {new Date(item.created_at).toLocaleDateString("pt-BR")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#A3A3A3]">Prompt livre</label>
                    <Textarea
                      value={captionFreePrompt}
                      onChange={(e) => setCaptionFreePrompt(e.target.value)}
                      placeholder="Descreva o conteúdo para gerar legendas..."
                      className="min-h-20 border-[#2A2A2A] bg-[#151515] text-[#F5F5F5]"
                    />
                  </div>

                  {selectedContentForCaptions?.image_url && (
                    <div className="rounded-lg border border-[#2A2A2A] bg-[#151515] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedContentForCaptions.image_url}
                        alt="Prévia do conteúdo"
                        className="h-40 w-full rounded object-cover"
                      />
                    </div>
                  )}

                  <Button
                    type="button"
                    className="w-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                    disabled={captionLoading}
                    onClick={() => {
                      void handleGenerateCaptions();
                    }}
                  >
                    {captionLoading ? "Gerando legendas..." : "Gerar legendas"}
                  </Button>
                </div>
              </div>

              {captionOptions.length > 0 && (
                <div className="rounded-xl border border-[#242428] bg-[#101012] p-4">
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">Opções</h3>
                  <div className="mt-3 space-y-3">
                    {captionOptions.map((caption, idx) => (
                      <div
                        key={`caption-${idx}`}
                        className={`rounded-lg border p-3 ${
                          chosenCaption === caption
                            ? "border-[#7C3AED] bg-[#7C3AED]/10"
                            : "border-[#2A2A2A] bg-[#151515]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm text-[#F5F5F5]">{caption}</p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-[#2A2A2A] text-[#F5F5F5]"
                            onClick={() => {
                              void handleUseCaption(caption);
                            }}
                          >
                            Usar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-[#2A2A2A] text-[#F5F5F5]"
                            disabled={!captionTargetId || savingCaption}
                            onClick={() => {
                              setChosenCaption(caption);
                              void handleSaveCaption(caption);
                            }}
                          >
                            {savingCaption ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {premadeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[#2A2A2A] bg-[#131313] p-5">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">Choose Premade</h3>
            <p className="mt-1 text-sm text-[#888888]">Escolha um preset para pré-preencher o formulário.</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {PREMADES.map((preset, index) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => applyPremade(index)}
                  className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-3 text-left hover:border-[#7C3AED]/60"
                >
                  <p className="text-sm font-semibold text-[#F5F5F5]">{preset.title}</p>
                  <p className="mt-1 text-xs text-[#888888]">
                    {preset.values.gender} • {preset.values.age_range} • {preset.values.styles.join("/")}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                onClick={() => setPremadeOpen(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-[#2A2A2A] bg-[#131313] p-5 max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">Create New Influencer</h3>
            <p className="mt-1 text-sm text-[#888888]">Defina atributos e gere 4 candidatos de rosto.</p>

            {generating ? (
              <div className="mt-6 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <GenerationCard
                      key={`candidate-processing-${idx}`}
                      status="processing"
                      label={`Candidato ${Math.max(genProgress, idx + 1)}/4`}
                      estimatedTime="~1–3 min"
                    />
                  ))}
                </div>
              </div>
            ) : variations.length > 0 ? (
              <div className="mt-5 space-y-4">
                <h4 className="text-base font-semibold text-[#F5F5F5]">Choose Your Avatar</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {variations.map((url) => {
                    const active = selectedVariation === url;
                    return (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setSelectedVariation(url)}
                        className={`overflow-hidden rounded-lg border transition ${
                          active ? "border-[#7C3AED] ring-2 ring-[#7C3AED]/30" : "border-[#2A2A2A]"
                        }`}
                      >
                        <GenerationCard
                          status="completed"
                          label="Variação"
                          result_url={url}
                          mediaType="image"
                          className="h-56 rounded-none border-0 ring-0"
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    className="border-[#2A2A2A] text-[#E5E5E5]"
                    onClick={() => void handleRegenerate()}
                    disabled={generating}
                  >
                    Regenerate
                  </Button>
                  <Button
                    className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                    onClick={() => void handleConfirmCreate()}
                    disabled={!selectedVariation || confirming}
                  >
                    {confirming ? "Confirmando..." : "Confirm & Create"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-[#A3A3A3]">Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Luna Parker"
                    className="border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#A3A3A3]">Gender *</label>
                  <PillGroup options={GENDERS} value={gender} onChange={(v) => setGender(v)} />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#A3A3A3]">Age Range *</label>
                  <PillGroup options={AGES} value={ageRange} onChange={(v) => setAgeRange(v)} />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#A3A3A3]">Style & Aesthetic *</label>
                  <MultiSelectChips options={STYLES} values={styles} onToggle={toggleStyle} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[#A3A3A3]">Hair Color *</label>
                    <PillGroup options={HAIR_COLORS} value={hairColor} onChange={(v) => setHairColor(v)} />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#A3A3A3]">Eye Color *</label>
                    <PillGroup options={EYE_COLORS} value={eyeColor} onChange={(v) => setEyeColor(v)} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#A3A3A3]">Additional Details</label>
                  <Textarea
                    value={additionalDetails}
                    onChange={(e) => setAdditionalDetails(e.target.value)}
                    placeholder="Ex.: with freckles, natural makeup"
                    className="min-h-20 border-[#2A2A2A] bg-[#1A1A1A] text-[#F5F5F5]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#A3A3A3]">
                    Upload Reference Images (até 8)
                  </label>
                  <Dropzone
                    disabled={uploadingRefs}
                    uploading={uploadingRefs}
                    label={uploadingRefs ? "Enviando referências..." : "Referências de estilo/rosto"}
                    onFiles={(files) => {
                      void uploadReferences(files);
                    }}
                  />

                  {referenceImageUrls.length > 0 && (
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {referenceImageUrls.map((url, idx) => (
                        <div key={`${url}-${idx}`} className="relative overflow-hidden rounded border border-[#2A2A2A]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="ref" className="h-16 w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[#888888]">Saldo atual: {userCredits} créditos</span>
                  <Button
                    className="bg-[#7C3AED] text-white hover:bg-[#6D28D9] disabled:opacity-50"
                    disabled={!canGenerate || generating}
                    onClick={() => void handleGenerate()}
                  >
                    Generate Avatar — ~{estimatedCost} créditos
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                className="border-[#2A2A2A] text-[#E5E5E5]"
                onClick={() => {
                  if (generating || confirming) return;
                  setCreateOpen(false);
                  resetCreateState();
                }}
                disabled={generating || confirming}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
