"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`block rounded-lg border-2 border-dashed p-4 text-center transition ${
        dragging
          ? "border-[#7C3AED] bg-[#7C3AED]/10"
          : "border-[#2A2A2A] bg-[#1A1A1A] hover:border-[#7C3AED]/60"
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
      <div className="flex flex-col items-center gap-2">
        <Upload className="h-5 w-5 text-[#A78BFA]" />
        <p className="text-sm font-medium text-[#F5F5F5]">{label}</p>
        <p className="text-xs text-[#888888]">Arraste e solte ou clique para selecionar</p>
      </div>
    </label>
  );
}

export default function InfluencerPage() {
  const [loading, setLoading] = useState(true);
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null);
  const [activePersonaTab, setActivePersonaTab] = useState<"feed" | "presets" | "captions">("feed");

  const [createOpen, setCreateOpen] = useState(false);
  const [premadeOpen, setPremadeOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
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
      const picked =
        models.find((m: { model_id?: string }) => m.model_id === "gpt-image-2") ||
        models.find((m: { model_id?: string }) => m.model_id === "nano-banana-pro") ||
        models[0];
      const unit = Number(picked?.credit_cost || 0);
      setEstimatedCost(unit * 4);
    } catch {
      // noop
    }
  }

  useEffect(() => {
    void loadInfluencers();
    void loadMe();
    void loadEstimatedCost();
  }, []);

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
  }

  function openCreateModal() {
    setCreateOpen(true);
    setPremadeOpen(false);
    resetCreateState();
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

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    const toastId = toast.loading("Generating your influencer...");

    try {
      const res = await fetch("/api/influencers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      if (vars.length !== 4) {
        throw new Error("A geração não retornou os 4 candidatos esperados.");
      }

      setDraftInfluencerId(data.influencer_id as string);
      setVariations(vars);
      setSelectedVariation(vars[0]);
      void loadMe();

      toast.success("Candidatos gerados! Escolha seu avatar.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar influencer.", { id: toastId });
    } finally {
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
    setVariations([]);
    setSelectedVariation("");
    setDraftInfluencerId(null);
    await handleGenerate();
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
    <div className="space-y-6">
      <section className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#F5F5F5]">Your very own influencer studio</h1>
            <p className="mt-1 text-sm text-[#9A9A9A]">
              Crie personas visuais consistentes e prepare sua operação de conteúdo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-[#2A2A2A] text-[#F5F5F5]"
              onClick={() => setPremadeOpen(true)}
            >
              Choose Premade
            </Button>
            <Button
              className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
              onClick={openCreateModal}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create Influencer
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Personas</h2>
          <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">{influencers.length} criadas</Badge>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-5 text-sm text-[#888888]">
            Carregando personas...
          </div>
        ) : influencers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2A2A2A] bg-[#141414] p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-[#7C3AED]" />
            <p className="mt-3 text-[#F5F5F5]">Nenhuma persona ainda</p>
            <p className="mt-1 text-sm text-[#888888]">Comece com um premade ou crie do zero.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {influencers.map((inf) => {
              const active = inf.id === selectedInfluencerId;
              return (
                <button
                  key={inf.id}
                  type="button"
                  onClick={() => {
                    setSelectedInfluencerId(inf.id);
                    setActivePersonaTab("feed");
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[#7C3AED] bg-[#7C3AED]/10"
                      : "border-[#2A2A2A] bg-[#141414] hover:border-[#7C3AED]/60"
                  }`}
                >
                  <div className="overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#101010]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={inf.avatar_image_url || inf.variations?.[0] || ""}
                      alt={inf.name}
                      className="h-40 w-full object-cover"
                    />
                  </div>
                  <div className="mt-2">
                    <p className="line-clamp-1 text-sm font-semibold text-[#F5F5F5]">{inf.name}</p>
                    <p className="line-clamp-1 text-xs text-[#8B8B8B]">{inf.handle || "@sem_handle"}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge className="bg-[#2A2A2A] text-[#BDBDBD]">{inf.status || "draft"}</Badge>
                    <span
                      className="text-xs text-[#FCA5A5] hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteInfluencer(inf.id);
                      }}
                    >
                      Excluir
                    </span>
                  </div>
                </button>
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

          <div className="rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] p-6 text-center">
            <p className="text-base text-[#F5F5F5]">Próxima etapa (4d-3)</p>
            <p className="mt-1 text-sm text-[#888888]">
              Aqui entrarão os fluxos de {activePersonaTab === "feed" ? "Feed" : activePersonaTab === "presets" ? "Presets" : "Captions"} da persona.
            </p>
          </div>
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
              <div className="mt-6 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] p-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#A78BFA]" />
                <p className="mt-3 text-[#F5F5F5]">Generating your influencer...</p>
              </div>
            ) : variations.length === 4 ? (
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
                          active ? "border-[#7C3AED]" : "border-[#2A2A2A]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Variação" className="h-56 w-full object-cover" />
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
