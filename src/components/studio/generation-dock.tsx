"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Expand,
  Gauge,
  ImageIcon,
  Loader2,
  Lock,
  Monitor,
  Music,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/stores/use-studio-store";
import { ASSIST_CATEGORIES } from "@/lib/assist-presets";
import { TTS_VOICES } from "@/lib/tts-voices";

type Modality = "image" | "video" | "audio";

interface ApiModel {
  id: string;
  name: string;
  provider: string;
  type: Modality;
  model_id: string;
  credit_cost: number;
  min_plan: string;
  family: string;
  available: boolean;
  family_description?: string;
  badge?: string;
  gen_time?: string;
  kind?: string;
  has_audio?: boolean;
  resolution?: string;
  duration_range?: string;
  dur_min?: number;
  dur_max?: number;
  backend?: string | null;
  task_type?: string;
  less_restriction?: boolean;
}

interface UserAsset {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

/** Persona (influencer) do usuário — usada para character tagging via @handle. */
interface InfluencerPersona {
  id: string;
  name: string;
  handle: string;
  avatar_image_url: string | null;
  status?: string;
}

interface SeedItem {
  id: string;
  name: string | null;
  preview_url: string | null;
  use_count: number;
  tags: string[] | null;
}

const TABS: { id: Modality; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Music },
];

const PLACEHOLDER: Record<Modality, string> = {
  image: "Describe the image you want to create...",
  video: "Describe the video you want to create...",
  audio: "Describe the audio you want to create...",
};

const ASPECT_RATIOS: Record<"image" | "video", string[]> = {
  image: ["1:1", "3:4", "9:16", "4:3", "3:2", "16:9"],
  video: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9"],
};

const RESOLUTIONS: Record<"image" | "video", string[]> = {
  image: ["1K", "2K", "4K"],
  video: ["480p", "720p", "1080p"],
};

const QUALITY_OPTIONS = ["low", "medium", "high"] as const;
const QUALITY_LABELS: Record<(typeof QUALITY_OPTIONS)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const ASSET_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "characters", label: "Characters" },
  { id: "scenes", label: "Scenes" },
  { id: "products", label: "Products" },
  { id: "custom", label: "Custom" },
];

/** Ícone de proporção — retângulo com a orientação do aspect ratio. */
/**
 * Lê a resposta como JSON de forma segura. Se o servidor (ou o nginx)
 * devolver HTML/texto (ex.: 413, 502, 504), lança um erro amigável em PT-BR
 * em vez de "Unexpected token '<' ... is not valid JSON".
 */
async function parseJsonSafe<T = Record<string, unknown>>(
  res: Response
): Promise<T | null> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413) {
      throw new Error(
        "Arquivo de referência muito grande. Use imagens de até 20 MB."
      );
    }
    throw new Error(
      `O servidor retornou uma resposta inesperada (HTTP ${res.status}). Tente novamente.`
    );
  }
}

function RatioIcon({ ratio, className }: { ratio: string; className?: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const max = 13;
  let width = max;
  let height = max;
  if (w > h) {
    height = Math.max(6, Math.round((h / w) * max));
  } else if (h > w) {
    width = Math.max(6, Math.round((w / h) * max));
  }
  return (
    <span className={cn("flex h-4 w-4 items-center justify-center", className)}>
      <span
        style={{ width, height }}
        className="rounded-[2px] border-[1.5px] border-current"
      />
    </span>
  );
}

/** Converte um nome de asset/persona em @handle (visual). */
function toHandle(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "asset"
  );
}

/** Regex de menções @handle no prompt (ignora @image1, @image2... do Seedance). */
const HANDLE_REGEX = /@([a-z0-9_]+)/gi;

function extractHandles(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(HANDLE_REGEX)) {
    const handle = match[1].toLowerCase();
    if (/^image\d*$/.test(handle)) continue;
    found.add(handle);
  }
  return Array.from(found);
}

/** Renderiza o texto do prompt com os @handles destacados como chips (overlay). */
function renderPromptHighlights(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(HANDLE_REGEX)) {
    const index = match.index ?? 0;
    if (/^image\d*$/.test(match[1].toLowerCase())) continue;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(
      <span
        key={`h-${key++}`}
        className="rounded-[4px] bg-[#7C3AED]/25 ring-1 ring-[#7C3AED]/40"
      >
        {match[0]}
      </span>
    );
    last = index + match[0].length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

/**
 * Ref callback que limita a altura de um painel ancorado por bottom-full ao
 * espaço disponível acima dele na viewport (nunca ultrapassa o topo da tela).
 * O bottom do painel é fixo (ancorado no trigger), então reduzir a altura
 * máxima mantém todo o conteúdo visível, com scroll interno.
 */
function clampPanelToViewport(el: HTMLDivElement | null) {
  if (!el) return;
  const apply = () => {
    const rect = el.getBoundingClientRect();
    const available = Math.max(160, rect.bottom - 84);
    el.style.maxHeight = `${available}px`;
    el.style.overflowY = "auto";
  };
  apply();
  // Reaplica num frame seguinte (após layout de imagens/fontes).
  requestAnimationFrame(apply);
}

function Popover({
  trigger,
  children,
  panelClassName,
  triggerClassName,
  onOpenChange,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  panelClassName?: string;
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    }

    function onEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        onOpenChange?.(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            onOpenChange?.(!v);
            return !v;
          });
        }}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 py-1.5 text-xs text-[#d0d0d0] transition-colors duration-150 hover:border-[#7C3AED]/40 hover:bg-white/5",
          open && "ring-1 ring-[#7C3AED]/50",
          triggerClassName
        )}
      >
        {trigger(open)}
      </button>

      {open && (
        <div
          ref={clampPanelToViewport}
          className={cn(
            "fx-scroll absolute bottom-full left-0 z-50 mb-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-1 shadow-2xl",
            panelClassName
          )}
        >
          {children(() => {
            setOpen(false);
            onOpenChange?.(false);
          })}
        </div>
      )}
    </div>
  );
}

// ─── Logging estruturado da auditoria (console do browser) ───────────────────
// Formato: [FLUXYRA-GEN] {ts, scope, event, requestId, ms?, data}
function genLog(
  event: string,
  requestId: string,
  data?: Record<string, unknown>,
  ms?: number
) {
  try {
    console.log(
      "[FLUXYRA-GEN]",
      JSON.stringify({
        ts: new Date().toISOString(),
        scope: "frontend.generation-dock",
        event,
        requestId,
        ...(typeof ms === "number" ? { ms: Math.round(ms) } : {}),
        ...(data ? { data } : {}),
      })
    );
  } catch {
    console.log("[FLUXYRA-GEN]", event, requestId, data);
  }
}

function newClientRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

async function uploadReferenceFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "Falha no upload do arquivo.");
  }
  return data.url;
}

function ControlButton({
  children,
  icon,
  active,
  onClick,
  muted,
  iconOnly,
  title,
}: {
  children?: ReactNode;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
  muted?: boolean;
  iconOnly?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        iconOnly
          ? "flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2A2A] bg-white/5 text-[#c9c9d1] transition-colors duration-150 hover:bg-white/10"
          : "flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 py-1.5 text-xs text-[#c9c9d1] transition-colors duration-150 hover:border-[#7C3AED]/40 hover:bg-white/10",
        active && "ring-1 ring-[#7C3AED]/50",
        muted ? "text-[#8b8b93]" : "text-[#c9c9d1]"
      )}
    >
      {icon}
      {!iconOnly ? children : null}
    </button>
  );
}

/** Pill de spec exibido no submenu de variantes (resolução / duração). */
function SpecPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-md border border-[#2A2A2A] bg-[#1F1F1F] px-1.5 py-0.5 text-[10px] text-[#888888]">
      {icon}
      {label}
    </span>
  );
}

interface FamilyGroup {
  family: string;
  description: string;
  models: ApiModel[];
}

/** Menu premium de modelos com busca, badges e estado de bloqueio. */
function ModelMenu({
  groups,
  selectedId,
  onSelect,
}: {
  groups: FamilyGroup[];
  selectedId: string;
  onSelect: (model: ApiModel) => void;
}) {
  const [query, setQuery] = useState("");

  function tierBadge(model: ApiModel): { label: string; className: string } {
    const source = `${model.provider} ${model.family} ${model.type} ${model.badge || ""}`.toLowerCase();
    if (source.includes("gpt")) return { label: "GPT", className: "bg-emerald-500/10 text-emerald-400" };
    if (source.includes("video")) return { label: "Video", className: "bg-blue-500/10 text-blue-400" };
    if (source.includes("audio") || source.includes("tts")) {
      return { label: "Audio", className: "bg-cyan-500/10 text-cyan-400" };
    }
    return { label: model.family || "Model", className: "bg-violet-500/10 text-violet-300" };
  }

  /** Tags de capacidade (visual): REF = suporta referência de personagem; BATCH = multi-shot. */
  function capabilityTags(model: ApiModel): string[] {
    if (model.type !== "video") return [];
    const src = `${model.name} ${model.family} ${model.backend || ""}`.toLowerCase();
    const tags: string[] = [];
    if (src.includes("seedance") || (src.includes("kling") && src.includes("omni"))) tags.push("REF");
    if (src.includes("kling") && !src.includes("omni") && !src.includes("turbo")) tags.push("BATCH");
    return tags;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => {
        if (!normalizedQuery) return true;
        const haystack = `${model.name} ${model.family} ${model.provider} ${model.badge || ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    }))
    .filter((group) => group.models.length > 0);

  return (
    <div className="w-[360px] p-2">
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-2.5">
        <Search className="h-3.5 w-3.5 text-[#666666]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar modelo..."
          className="h-9 w-full bg-transparent text-sm text-[#F5F5F5] placeholder:text-[#666666] focus:outline-none"
        />
      </div>

      <div className="fx-scroll max-h-[min(40vh,300px)] overflow-y-auto pr-1">
        {filteredGroups.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#777777]">Nenhum modelo encontrado.</p>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.family} className="mb-3">
              <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wider text-[#888888]">
                {group.family}
              </p>
              {group.description ? (
                <p className="px-2 pb-1 text-[11px] leading-snug text-[#8b8b93]">{group.description}</p>
              ) : null}

              <div className="space-y-1.5">
                {group.models.map((model) => {
                  const selected = model.id === selectedId;
                  const available = model.available !== false;
                  const badge = tierBadge(model);
                  const disabledTitle = available ? undefined : "Modelo indisponível para seu plano";

                  return (
                    <button
                      key={model.id}
                      type="button"
                      title={disabledTitle}
                      disabled={!available}
                      onClick={() => onSelect(model)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl p-2 text-left transition duration-150",
                        "hover:bg-white/5",
                        selected &&
                          "bg-[#7C3AED]/5 ring-2 ring-[#7C3AED] shadow-[0_0_15px_rgba(124,58,237,0.2)]",
                        !available && "pointer-events-none opacity-50"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2A2A2A] text-xs font-semibold text-[#F5F5F5]">
                        {(model.family || model.name || "M").charAt(0)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[#F5F5F5]">{model.name}</span>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", badge.className)}>
                            {badge.label}
                          </span>
                          {capabilityTags(model).map((tag) => (
                            <span
                              key={tag}
                              className="rounded border border-[#2E2E33] bg-white/5 px-1 py-px text-[9px] font-semibold tracking-wide text-[#9a9aa3]"
                            >
                              {tag}
                            </span>
                          ))}
                          {model.has_audio ? <Volume2 className="h-3 w-3 text-[#888888]" /> : null}
                          {!available ? <Lock className="ml-auto h-3.5 w-3.5 text-[#888888]" /> : null}
                          {selected ? <Check className="ml-auto h-3.5 w-3.5 text-[#A78BFA]" /> : null}
                        </span>

                        <span className="mt-1 flex items-center gap-1.5">
                          {model.resolution ? (
                            <SpecPill icon={<Monitor className="h-2.5 w-2.5" />} label={model.resolution} />
                          ) : null}
                          {model.duration_range ? (
                            <SpecPill icon={<Clock className="h-2.5 w-2.5" />} label={model.duration_range} />
                          ) : null}
                        </span>
                      </span>

                      <span className="shrink-0 text-xs text-[#888888]">⚡ {model.credit_cost}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Seletor de voz de TTS com busca, filtros e preview de áudio. */
function VoiceSelector({
  voiceId,
  onSelect,
}: {
  voiceId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [accent, setAccent] = useState("All");
  const [gender, setGender] = useState("All");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const accents = useMemo(
    () => ["All", ...Array.from(new Set(TTS_VOICES.map((v) => v.accent)))],
    []
  );
  const genders = ["All", "Female", "Male"];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TTS_VOICES.filter((v) => {
      if (accent !== "All" && v.accent !== accent) return false;
      if (gender !== "All" && v.gender !== gender) return false;
      if (
        q &&
        !v.name.toLowerCase().includes(q) &&
        !v.description.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [query, accent, gender]);

  const current = TTS_VOICES.find((v) => v.id === voiceId);

  function preview(id: string) {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const el = new Audio(`/api/voices/preview?voice=${encodeURIComponent(id)}`);
      audioRef.current = el;
      setPlaying(id);
      el.onended = () => setPlaying((p) => (p === id ? null : p));
      el.onerror = () => setPlaying((p) => (p === id ? null : p));
      void el.play().catch(() => setPlaying(null));
    } catch {
      setPlaying(null);
    }
  }

  return (
    <Popover
      panelClassName="w-[320px]"
      trigger={() => (
        <>
          <Volume2 className="h-4 w-4 text-[#888888]" />
          <span className="max-w-[130px] truncate">
            {current?.name || "Select voice"}
          </span>
          <ChevronUp className="h-3 w-3 text-[#666666]" />
        </>
      )}
    >
      {(close) => (
        <div className="flex max-h-[min(40vh,300px)] w-full flex-col p-1.5">
          {/* Busca */}
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#000000] px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#666666]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search voices..."
              className="h-8 w-full bg-transparent text-sm text-[#F5F5F5] placeholder:text-[#666666] focus:outline-none"
            />
          </div>

          {/* Filtros */}
          <div className="mb-2 flex flex-wrap gap-1">
            {accents.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAccent(a)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px]",
                  a === accent
                    ? "border-[#7C3AED] bg-[#7C3AED]/15 text-[#F5F5F5]"
                    : "border-[#2A2A2A] bg-[#1A1A1A] text-[#888888] hover:text-[#F5F5F5]"
                )}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-1">
            {genders.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px]",
                  g === gender
                    ? "border-[#7C3AED] bg-[#7C3AED]/15 text-[#F5F5F5]"
                    : "border-[#2A2A2A] bg-[#1A1A1A] text-[#888888] hover:text-[#F5F5F5]"
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Lista de vozes */}
          <div className="fx-scroll max-h-[min(40vh,300px)] flex-1 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-[#666666]">
                No voices found
              </p>
            )}
            {filtered.map((v) => {
              const selected = v.id === voiceId;
              return (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5",
                    selected ? "bg-[#1F1F1F]" : "hover:bg-[#1F1F1F]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => preview(v.id)}
                    title="Preview voice"
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                      playing === v.id
                        ? "border-[#7C3AED] bg-[#7C3AED]/20 text-[#9B8AFB]"
                        : "border-[#2A2A2A] bg-[#000000] text-[#888888] hover:text-[#F5F5F5]"
                    )}
                  >
                    {playing === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(v.id);
                      close();
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-[#F5F5F5]">
                        {v.name}
                      </span>
                      {selected && (
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#9B8AFB]" />
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-[#888888]">
                      {v.description}
                    </span>
                    <span className="block truncate text-[10px] text-[#666666]">
                      {v.accent} · {v.gender} · {v.age}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

export function GenerationDock() {
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const prompt = useStudioStore((s) => s.prompt);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const negativePrompt = useStudioStore((s) => s.negativePrompt);
  const setNegativePrompt = useStudioStore((s) => s.setNegativePrompt);
  const selectedModelId = useStudioStore((s) => s.selectedModelId);
  const setSelectedModelId = useStudioStore((s) => s.setSelectedModelId);
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const duration = useStudioStore((s) => s.duration);
  const setDuration = useStudioStore((s) => s.setDuration);
  const resolution = useStudioStore((s) => s.resolution);
  const setResolution = useStudioStore((s) => s.setResolution);
  const quality = useStudioStore((s) => s.quality);
  const setQuality = useStudioStore((s) => s.setQuality);
  const ttsVoice = useStudioStore((s) => s.ttsVoice);
  const setTtsVoice = useStudioStore((s) => s.setTtsVoice);
  const stability = useStudioStore((s) => s.stability);
  const setStability = useStudioStore((s) => s.setStability);
  const similarity = useStudioStore((s) => s.similarity);
  const setSimilarity = useStudioStore((s) => s.setSimilarity);
  const speed = useStudioStore((s) => s.speed);
  const setSpeed = useStudioStore((s) => s.setSpeed);
  const batchCount = useStudioStore((s) => s.batchCount);
  const setBatchCount = useStudioStore((s) => s.setBatchCount);
  const referenceTab = useStudioStore((s) => s.referenceTab);
  const setReferenceTab = useStudioStore((s) => s.setReferenceTab);
  const referenceImageUrl = useStudioStore((s) => s.referenceImageUrl);
  const startImageUrl = useStudioStore((s) => s.startImageUrl);
  const setStartImageUrl = useStudioStore((s) => s.setStartImageUrl);
  const endImageUrl = useStudioStore((s) => s.endImageUrl);
  const setEndImageUrl = useStudioStore((s) => s.setEndImageUrl);
  const referenceImages = useStudioStore((s) => s.referenceImages);
  const addReferenceImage = useStudioStore((s) => s.addReferenceImage);
  const removeReferenceImage = useStudioStore((s) => s.removeReferenceImage);
  const referenceVideos = useStudioStore((s) => s.referenceVideos);
  const addReferenceVideo = useStudioStore((s) => s.addReferenceVideo);
  const removeReferenceVideo = useStudioStore((s) => s.removeReferenceVideo);
  const referenceAudios = useStudioStore((s) => s.referenceAudios);
  const addReferenceAudio = useStudioStore((s) => s.addReferenceAudio);
  const removeReferenceAudio = useStudioStore((s) => s.removeReferenceAudio);
  const triggerRefresh = useStudioStore((s) => s.triggerRefresh);
  const addOptimistic = useStudioStore((s) => s.addOptimistic);
  const clearOptimistic = useStudioStore((s) => s.clearOptimistic);
  const setViewFilter = useStudioStore((s) => s.setViewFilter);

  const [models, setModels] = useState<ApiModel[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistCategory, setAssistCategory] = useState(
    ASSIST_CATEGORIES[0]?.id ?? "subject"
  );
  const [atOpen, setAtOpen] = useState(false);
  const [assetCategory, setAssetCategory] = useState("all");
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [seeds, setSeeds] = useState<SeedItem[]>([]);
  const [seedsLoading, setSeedsLoading] = useState(false);
  // Personas do usuário (para resolver @handles do prompt em referências de rosto).
  const [personas, setPersonas] = useState<InfluencerPersona[]>([]);
  const personasFetchedRef = useRef(false);
  const [refSectionOpen, setRefSectionOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Multi-Shot (storyboard) — só Kling 3.0 (não omni/turbo)
  const [multiShotEnabled, setMultiShotEnabled] = useState(false);
  const [multiShotMode, setMultiShotMode] = useState<"auto" | "custom">("auto");
  const [autoShotCount, setAutoShotCount] = useState(3);
  const [autoShotDuration, setAutoShotDuration] = useState(5);
  const [customShots, setCustomShots] = useState<
    Array<{ prompt: string; duration: number }>
  >([
    { prompt: "", duration: 5 },
    { prompt: "", duration: 5 },
  ]);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const refVideoInputRef = useRef<HTMLInputElement>(null);
  const refAudioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const loadModels = useCallback(async (type: Modality) => {
    try {
      const res = await fetch(`/api/models?type=${type}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setModels(data.models || []);
    } catch {
      // silencioso
    }
  }, []);

  const loadCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.credits === "number") setCredits(data.credits);
    } catch {
      // silencioso
    }
  }, []);

  const loadAssets = useCallback(async (category: string) => {
    setAssetsLoading(true);
    try {
      const res = await fetch(`/api/assets?category=${category}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setAssets(data.assets || []);
    } catch {
      // silencioso
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  const loadSeeds = useCallback(async () => {
    setSeedsLoading(true);
    try {
      const res = await fetch("/api/seeds", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      setSeeds(Array.isArray(data?.seeds) ? data.seeds : []);
    } catch {
      // silencioso
    } finally {
      setSeedsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadModels(activeTab);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadModels]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCredits();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadCredits]);

  useEffect(() => {
    if (!atOpen) return;
    const timer = setTimeout(() => {
      void loadAssets(assetCategory);
    }, 0);
    return () => clearTimeout(timer);
  }, [atOpen, assetCategory, loadAssets]);

  useEffect(() => {
    if (!models.length) return;
    // Lista ainda é da aba anterior (fetch em andamento) — não sobrescrever o modelo selecionado.
    if (models[0]?.type !== activeTab) return;
    const exists = models.some((item) => item.id === selectedModelId);
    if (!exists) setSelectedModelId(models[0].id);
  }, [models, activeTab, selectedModelId, setSelectedModelId]);

  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );

  const familyGroups = useMemo<FamilyGroup[]>(() => {
    const groups: FamilyGroup[] = [];
    for (const model of models) {
      const family = model.family || model.name;
      let group = groups.find((g) => g.family === family);
      if (!group) {
        group = {
          family,
          description: model.family_description || "",
          models: [],
        };
        groups.push(group);
      }
      if (!group.description && model.family_description) {
        group.description = model.family_description;
      }
      group.models.push(model);
    }
    return groups;
  }, [models]);

  // Aspect ratios suportados variam por backend de vídeo.
  const aspectOptions = useMemo(() => {
    if (activeTab !== "video") return ASPECT_RATIOS.image;
    if (!selectedModel) return ASPECT_RATIOS.video;
    const backend = (selectedModel.backend || "").toLowerCase();
    const family = (selectedModel.family || "").toLowerCase();
    if (backend === "veo3" || backend === "veo3.1") return ["16:9", "9:16"];
    if (backend === "hailuo") return ["16:9", "9:16", "1:1"];
    if (family === "kling" || backend === "kling" || backend === "kling-turbo") {
      return ["16:9", "9:16", "1:1"];
    }
    if (backend === "wan") return ["16:9", "9:16", "1:1", "4:3", "3:4"];
    // Seedance e demais: todos
    return ASPECT_RATIOS.video;
  }, [activeTab, selectedModel]);

  // Resoluções suportadas variam por backend de vídeo.
  const resolutionOptions = useMemo(() => {
    if (activeTab !== "video") return RESOLUTIONS.image;
    if (!selectedModel) return RESOLUTIONS.video;
    const backend = (selectedModel.backend || "").toLowerCase();
    const taskType = (selectedModel.task_type || "").toLowerCase();
    if (backend === "wan") return ["720p", "1080p"];
    if (backend === "veo3" || backend === "veo3.1") return ["720p", "1080p"];
    if (
      backend === "seedance" &&
      (taskType.includes("fast") || taskType.includes("mini"))
    ) {
      return ["480p", "720p"];
    }
    return RESOLUTIONS.video;
  }, [activeTab, selectedModel]);
  const safeAspect = aspectOptions.includes(aspectRatio)
    ? aspectRatio
    : aspectOptions[0];
  const safeResolution = resolutionOptions.includes(resolution)
    ? resolution
    : resolutionOptions[0];
  const creditCost = selectedModel?.credit_cost ?? 1;
  const totalCost = activeTab === "image" ? creditCost * batchCount : creditCost;
  const insufficient = credits !== null && credits < totalCost;

  const durMin = selectedModel?.dur_min ?? 4;
  const durMax = selectedModel?.dur_max ?? 15;

  // Alguns backends só aceitam durações enum (não contínuas).
  const durationSnapValues = useMemo<number[] | null>(() => {
    if (activeTab !== "video" || !selectedModel) return null;
    const backend = (selectedModel.backend || "").toLowerCase();
    if (backend === "wan") return [5, 10, 15];
    if (backend === "hailuo") return [6, 10];
    if (backend === "veo3" || backend === "veo3.1") return [4, 6, 8];
    return null; // slider livre
  }, [activeTab, selectedModel]);

  // Se houver valores enum, garantir que a duração cai em um deles.
  const safeDuration = durationSnapValues
    ? durationSnapValues.reduce((a, b) =>
        Math.abs(b - duration) < Math.abs(a - duration) ? b : a
      )
    : Math.min(Math.max(duration, durMin), durMax);
  const totalRefs =
    referenceImages.length + referenceVideos.length + referenceAudios.length;

  // Modelo "Rosto Real" (variante less-restriction do Seedance).
  const isRealFaceModel = useMemo(() => {
    if (!selectedModel) return false;
    const tt = (selectedModel.task_type || "").toLowerCase();
    return (
      selectedModel.less_restriction === true ||
      tt.includes("less-restriction") ||
      selectedModel.badge === "REAL"
    );
  }, [selectedModel]);

  // Há alguma imagem anexada (start frame, referência única ou omni).
  const hasAnyImageRef = Boolean(
    startImageUrl || referenceImageUrl || referenceImages.length > 0
  );

  // Seedance com imagem: sugerir menção "@image1" no prompt.
  const isSeedanceWithImage =
    activeTab === "video" &&
    (selectedModel?.backend || "").toLowerCase() === "seedance" &&
    hasAnyImageRef;

  // @handles mencionados no prompt (ex.: @fashion_model) — ignora @image1..N.
  const taggedHandles = useMemo(() => extractHandles(prompt), [prompt]);

  // Modelos com suporte a character tagging (@persona vira referência):
  // Seedance (omni / less-restriction) e Kling Omni.
  const supportsCharacterTagging = useMemo(() => {
    if (!selectedModel || activeTab !== "video") return false;
    const backend = (selectedModel.backend || "").toLowerCase();
    const name = selectedModel.name.toLowerCase();
    if (backend === "seedance") return true;
    if ((selectedModel.family || "").toLowerCase() === "kling" && name.includes("omni")) {
      return true;
    }
    return false;
  }, [selectedModel, activeTab]);

  // Busca as personas do usuário na 1ª vez que um @handle aparece no prompt.
  useEffect(() => {
    if (taggedHandles.length === 0 || personasFetchedRef.current) return;
    personasFetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/influencers", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setPersonas(Array.isArray(data?.influencers) ? data.influencers : []);
      } catch {
        // silencioso
      }
    })();
  }, [taggedHandles]);

  // Personas resolvidas: @handle do prompt ↔ persona com avatar disponível.
  const resolvedTagged = useMemo(() => {
    if (taggedHandles.length === 0 || personas.length === 0) return [];
    return personas.filter(
      (p) =>
        p.avatar_image_url &&
        p.handle &&
        taggedHandles.includes(p.handle.toLowerCase().replace(/^@/, ""))
    );
  }, [taggedHandles, personas]);

  // Multi-Shot suportado apenas em Kling 3.0 (não Omni, não Turbo).
  const supportsMultiShot = useMemo(() => {
    if (!selectedModel || activeTab !== "video") return false;
    const name = selectedModel.name.toLowerCase();
    return (
      selectedModel.family === "Kling" &&
      !name.includes("omni") &&
      !name.includes("turbo") &&
      selectedModel.dur_min === 3 &&
      selectedModel.dur_max === 15
    );
  }, [selectedModel, activeTab]);

  useEffect(() => {
    if (!supportsMultiShot && multiShotEnabled) setMultiShotEnabled(false);
  }, [supportsMultiShot, multiShotEnabled]);

  function buildShots(): Array<{ prompt: string; duration: number }> {
    if (multiShotMode === "auto") {
      return Array.from({ length: autoShotCount }, () => ({
        prompt: prompt.trim(),
        duration: autoShotDuration,
      }));
    }
    const filled = customShots.filter((s) => s.prompt.trim().length > 0);
    return filled.length > 0 ? filled : customShots.slice(0, 1);
  }

  function selectModel(model: ApiModel) {
    setSelectedModelId(model.id);
    const min = model.dur_min ?? 4;
    const max = model.dur_max ?? 15;
    if (duration < min) setDuration(min);
    if (duration > max) setDuration(max);
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

  async function handlePickFile(
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: string | null) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("Enviando arquivo...");
    try {
      const url = await uploadReferenceFile(file);
      setter(url);
      toast.success("Referência adicionada.", { id: toastId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível enviar o arquivo.",
        { id: toastId }
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handlePickToList(
    event: ChangeEvent<HTMLInputElement>,
    add: (value: string) => void
  ) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const toastId = toast.loading(
      files.length > 1 ? `Enviando ${files.length} arquivos...` : "Enviando arquivo..."
    );
    let ok = 0;
    try {
      for (const file of files) {
        try {
          const url = await uploadReferenceFile(file);
          add(url);
          ok += 1;
        } catch {
          // segue com os demais arquivos
        }
      }
      if (ok > 0) {
        toast.success(
          ok > 1 ? `${ok} referências adicionadas.` : "Referência adicionada.",
          { id: toastId }
        );
      } else {
        toast.error("Não foi possível enviar os arquivos.", { id: toastId });
      }
    } finally {
      event.target.value = "";
    }
  }

  function appendToPrompt(snippet: string) {
    const cleaned = prompt.trim();
    setPrompt(cleaned ? `${cleaned}, ${snippet}` : snippet);
  }

  async function markSeedAsUsed(seedId: string) {
    try {
      await fetch(`/api/seeds/${seedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "use" }),
      });
    } catch {
      // silencioso
    }
  }

  async function handleWiseEnhance() {
    if (!prompt.trim()) {
      toast.error("Escreva um prompt para melhorar.");
      return;
    }
    if (enhancing) return;

    setEnhancing(true);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modality: activeTab }),
      });
      const data = await parseJsonSafe<{ error?: string; prompt?: string }>(res);
      if (!res.ok || !data?.prompt) {
        throw new Error(data?.error || "Falha ao melhorar o prompt.");
      }
      setPrompt(data.prompt);
      toast.success("Prompt aprimorado pelo Wise.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao melhorar o prompt."
      );
    } finally {
      setEnhancing(false);
    }
  }

  async function submitSingleGeneration(parentRequestId?: string) {
    const requestId = parentRequestId || newClientRequestId();
    const t0 = performance.now();
    const body: Record<string, unknown> = {
      prompt,
      model_uuid: selectedModelId,
    };

    if (activeTab !== "audio") {
      body.aspect_ratio = safeAspect;
      body.quality = quality;
    }

    if (activeTab === "audio" && selectedModel?.kind === "tts") {
      body.voice_id = ttsVoice;
      body.stability = stability;
      body.similarity = similarity;
      body.speed = speed;
    }

    if (activeTab === "image") {
      body.resolution = safeResolution;
      const ref = referenceImages[0] || referenceImageUrl;
      if (ref) {
        body.reference_image_url = ref;
      }
    }

    if (activeTab === "video") {
      body.duration = safeDuration;
      body.resolution = safeResolution;
      if (negativePrompt.trim()) body.negative_prompt = negativePrompt.trim();
      if (referenceTab === "omni") {
        // Omni Reference: enviar TODAS as imagens de referência (não apenas a 1ª).
        if (referenceImages.length > 0) {
          body.reference_images = referenceImages;
        } else if (referenceImageUrl) {
          body.reference_images = [referenceImageUrl];
        }
      }
      if (referenceTab === "start-end") {
        if (startImageUrl) body.start_image_url = startImageUrl;
        if (endImageUrl) body.end_image_url = endImageUrl;
      }
      // Character tagging (@persona → referência de rosto / face lock).
      // Só nos modelos com suporte (Seedance / Kling Omni). Nos demais, o banner
      // avisa que as tags serão ignoradas e NÃO enviamos as referências.
      // Não injeta no modo start-end com frames definidos, pois no Seedance a
      // presença de reference_images sobrescreveria o uso de start/end frame.
      if (
        supportsCharacterTagging &&
        resolvedTagged.length > 0 &&
        !(referenceTab === "start-end" && (startImageUrl || endImageUrl))
      ) {
        const existing = Array.isArray(body.reference_images)
          ? (body.reference_images as string[])
          : [];
        const avatars = resolvedTagged
          .map((p) => p.avatar_image_url as string)
          .filter((url) => url && !existing.includes(url));
        if (existing.length + avatars.length > 0) {
          body.reference_images = [...existing, ...avatars];
        }
        genLog("submit.character_tagging", requestId, {
          handles: resolvedTagged.map((p) => p.handle),
          avatars_added: avatars.length,
          reference_images_total: (body.reference_images as string[] | undefined)?.length || 0,
        });
      }
      // reference_videos não é suportado por hailuo/veo3/veo3.1.
      const backendSupportsRefVideos = !["hailuo", "veo3", "veo3.1"].includes(
        (selectedModel?.backend || "").toLowerCase()
      );
      if (referenceVideos.length > 0 && backendSupportsRefVideos) {
        body.reference_videos = referenceVideos;
      }
      if (referenceAudios.length > 0) body.reference_audios = referenceAudios;
      if (multiShotEnabled && supportsMultiShot) {
        body.shots = buildShots();
      }
      body.with_audio = audioEnabled;
    }

    // AUDIT: payload completo que será enviado ao backend
    genLog("submit.request", requestId, {
      endpoint: `/api/generate/${activeTab}`,
      model: selectedModel?.name,
      backend: selectedModel?.backend,
      body,
    });

    let res: Response;
    try {
      res = await fetch(`/api/generate/${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      // AUDIT: exceção de rede antes de qualquer resposta
      genLog("submit.network_error", requestId, {
        error: netErr instanceof Error ? netErr.message : String(netErr),
      }, performance.now() - t0);
      throw netErr;
    }

    const data = await parseJsonSafe<{ error?: string }>(res);

    // AUDIT: resposta completa recebida do backend
    genLog("submit.response", requestId, {
      http_status: res.status,
      ok: res.ok,
      response: data,
    }, performance.now() - t0);

    if (!res.ok) {
      let errMsg = data?.error || "Falha ao enviar geração";
      if (
        errMsg.toLowerCase().includes("insufficient credits") ||
        errMsg.toLowerCase().includes("freeze credit") ||
        errMsg.toLowerCase().includes("quota not enough") ||
        errMsg.toLowerCase().includes("account point")
      ) {
        errMsg =
          "Saldo PiAPI insuficiente. Adicione créditos em piapi.ai para continuar gerando.";
      }
      genLog("submit.failed", requestId, { error_message: errMsg }, performance.now() - t0);
      throw new Error(errMsg);
    }

    genLog("submit.success", requestId, {}, performance.now() - t0);
  }

  async function handleGenerate() {
    const requestId = newClientRequestId();
    const t0 = performance.now();

    // AUDIT: clique em Generate — estado completo dos parâmetros
    genLog("handleGenerate.entrada", requestId, {
      tab: activeTab,
      prompt_preview: prompt.slice(0, 80),
      model: selectedModel?.name,
      backend: selectedModel?.backend,
      model_uuid: selectedModelId,
      aspect_ratio: safeAspect,
      duration: safeDuration,
      resolution: safeResolution,
      quality,
      credits,
      totalCost,
      insufficient,
      referenceTab,
      startImageUrl: Boolean(startImageUrl),
      endImageUrl: Boolean(endImageUrl),
      referenceImages: referenceImages.length,
      referenceVideos: referenceVideos.length,
      referenceAudios: referenceAudios.length,
    });

    if (!prompt.trim()) {
      genLog("handleGenerate.bloqueado", requestId, { motivo: "prompt_vazio" }, performance.now() - t0);
      toast.error("Escreva um prompt para gerar.");
      return;
    }

    if (selectedModel && !selectedModel.available) {
      genLog("handleGenerate.bloqueado", requestId, { motivo: "modelo_indisponivel" }, performance.now() - t0);
      toast.error("Este modelo ainda não está disponível.");
      return;
    }

    if (insufficient) {
      genLog("handleGenerate.bloqueado", requestId, {
        motivo: "creditos_insuficientes",
        totalCost,
        credits,
      }, performance.now() - t0);
      toast.error(`Créditos insuficientes. Precisa de ${totalCost}, disponível: ${credits ?? 0}.`);
      return;
    }

    setLoading(true);
    // Mostrar cards optimistas no feed IMEDIATAMENTE (antes da resposta do servidor)
    const count = activeTab === "image" && batchCount > 1 ? batchCount : 1;
    addOptimistic(activeTab, safeAspect, count);
    setViewFilter("all");
    setCollapsed(true);

    try {
      if (activeTab === "image" && batchCount > 1) {
        const jobs = Array.from({ length: batchCount }).map(() =>
          submitSingleGeneration(requestId)
        );
        const results = await Promise.allSettled(jobs);
        const successCount = results.filter(
          (item) => item.status === "fulfilled"
        ).length;

        if (!successCount) throw new Error("Nenhuma geração foi enviada.");

        toast.success(`${successCount} gerações enviadas.`);
      } else {
        await submitSingleGeneration(requestId);
        toast.success("Geração enviada! Acompanhe no feed.");
      }

      setPrompt("");
      clearOptimistic();
      triggerRefresh();
      void loadCredits();
      genLog("handleGenerate.sucesso", requestId, {}, performance.now() - t0);
    } catch (error) {
      clearOptimistic();
      // AUDIT: exceção durante o fluxo de geração
      genLog("handleGenerate.excecao", requestId, {
        error: error instanceof Error ? error.message : String(error),
      }, performance.now() - t0);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível gerar."
      );
    } finally {
      setLoading(false);
    }
  }

  const activeAssistCategory =
    ASSIST_CATEGORIES.find((c) => c.id === assistCategory) ??
    ASSIST_CATEGORIES[0];
  const activeAssetCategory =
    ASSET_CATEGORIES.find((c) => c.id === assetCategory) ?? ASSET_CATEGORIES[0];

  const showReferenceSections =
    (activeTab === "video" && referenceTab === "omni") ||
    (activeTab === "image" && refSectionOpen);

  return (
    <section className="fixed bottom-4 left-1/2 z-30 mx-auto w-full max-w-[1100px] min-w-0 -translate-x-1/2 rounded-2xl border border-[#242428] bg-[#141416] px-4 py-4 shadow-[0_-8px_40px_rgba(0,0,0,0.4)] backdrop-blur-sm">
      {/* Painel Assist — duas colunas (CATEGORIES | {CAT} · CLICK TO ADD) */}
      {activeTab !== "audio" && assistOpen && (
        <div
          ref={clampPanelToViewport}
          className="dock-panel-enter fx-scroll absolute bottom-[4.5rem] right-4 z-50 w-[560px] max-w-[calc(100vw-2rem)] rounded-xl border border-[#2A2A2A] bg-[#161618] shadow-2xl"
        >
          <div className="grid grid-cols-[180px_1fr]">
            <div className="fx-scroll max-h-[min(40vh,300px)] overflow-y-auto border-r border-[#242428] p-2">
              <p className="mb-1.5 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                Categories
              </p>
              {ASSIST_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setAssistCategory(category.id)}
                  className={cn(
                    "block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px]",
                    category.id === assistCategory
                      ? "bg-white/5 text-[#F5F5F5]"
                      : "text-[#8b8b93] hover:bg-white/5 hover:text-[#F5F5F5]"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="fx-scroll max-h-[min(40vh,300px)] overflow-y-auto p-2">
              <div className="mb-1.5 flex items-center justify-between px-2 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                  {activeAssistCategory.label} · Click to add
                </p>
                <button
                  type="button"
                  onClick={() => setAssistOpen(false)}
                  className="text-[#666666] hover:text-[#F5F5F5]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {activeAssistCategory.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => appendToPrompt(option)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[#d0d0d0] hover:bg-white/5 hover:text-[#F5F5F5]"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Painel @ (assets/personas) — popover duas colunas com avatar + @handle */}
      {activeTab !== "audio" && atOpen && (
        <div
          ref={clampPanelToViewport}
          className="dock-panel-enter fx-scroll absolute bottom-[4.5rem] right-4 z-50 w-[560px] max-w-[calc(100vw-2rem)] rounded-xl border border-[#2A2A2A] bg-[#161618] shadow-2xl"
        >
          <div className="grid grid-cols-[180px_1fr]">
            <div className="fx-scroll max-h-[min(40vh,300px)] overflow-y-auto border-r border-[#242428] p-2">
              <p className="mb-1.5 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                Categories
              </p>
              {ASSET_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setAssetCategory(category.id)}
                  className={cn(
                    "block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px]",
                    category.id === assetCategory
                      ? "bg-white/5 text-[#F5F5F5]"
                      : "text-[#8b8b93] hover:bg-white/5 hover:text-[#F5F5F5]"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="fx-scroll max-h-[min(40vh,300px)] overflow-y-auto p-2">
              <div className="mb-1.5 flex items-center justify-between px-2 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                  {activeAssetCategory.label} · Click to add
                </p>
                <button
                  type="button"
                  onClick={() => setAtOpen(false)}
                  className="text-[#666666] hover:text-[#F5F5F5]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {assetsLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-[#666666]" />
                </div>
              ) : assets.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-[#666666]">
                  No assets found
                </div>
              ) : (
                <div className="space-y-0.5">
                  {assets.map((asset) => {
                    const handle = toHandle(asset.name);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          addReferenceImage(asset.image_url);
                          toast.success(`"${asset.name}" adicionado às referências.`);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                        title={asset.name}
                      >
                        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#2A2A2A] bg-[#1A1A1A]">
                          <Image
                            src={asset.image_url}
                            alt={asset.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-[#A78BFA]">
                              @{handle}
                            </span>
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-widest text-[#8B5CF6]">
                              {asset.category === "characters"
                                ? "Character"
                                : asset.category === "scenes"
                                  ? "Scene"
                                  : asset.category === "products"
                                    ? "Product"
                                    : "Custom"}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-[#8b8b93]">
                            {asset.name}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Image | Video | Audio — segmented compacto, ativa em violeta */}
      <div className="mt-1 inline-flex items-center gap-0.5 rounded-lg bg-[#1A1A1A] p-0.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150",
                active
                  ? "bg-white/5 font-medium text-[#A78BFA]"
                  : "text-[#8b8b93] hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5",
                  active ? "text-[#A78BFA]" : "text-[#8b8b93]"
                )}
              />
              {label}
            </button>
          );
        })}
      </div>

      <div className="my-2 h-px bg-[#242428]" />

      <form
        className="px-1 pb-1 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate();
        }}
      >
        {/* Prompt multiline + chips @handle + contador + colapsar */}
        <div className="mb-2">
          <div className="relative">
            {/* Overlay de realce dos @handles (atrás da textarea, mesmo box) */}
            <div
              ref={overlayRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words p-4 pr-10 text-[15px] leading-6 text-transparent"
            >
              {renderPromptHighlights(prompt)}
            </div>
            <textarea
              ref={textareaRef}
              value={prompt}
              maxLength={8000}
              rows={1}
              onChange={(event) => {
                setPrompt(event.target.value);
                autoResize();
              }}
              onInput={autoResize}
              onScroll={(event) => {
                if (overlayRef.current) {
                  overlayRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
              placeholder={PLACEHOLDER[activeTab]}
              className="relative z-10 min-h-[24px] w-full resize-none rounded-xl border-none bg-transparent p-4 pr-10 text-[15px] leading-6 text-[#F5F5F5] outline-none placeholder:text-[#666] focus:ring-1 focus:ring-[#7C3AED]/40"
            />
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              title={collapsed ? "Expandir controles" : "Recolher controles"}
              className="absolute right-3 top-4 z-20 text-[#666666] hover:text-[#F5F5F5]"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  collapsed && "rotate-180"
                )}
              />
            </button>
          </div>
          {/* Contador — canto inferior direito do prompt */}
          <div className="flex justify-end pr-2">
            <span className="text-[11px] text-[#6a6a72]">
              {prompt.length}/8000
            </span>
          </div>
        </div>

        {/* Banner amber — modelo sem suporte a character tagging */}
        {activeTab === "video" &&
          taggedHandles.length > 0 &&
          !supportsCharacterTagging &&
          selectedModel && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-400/90">
              <span aria-hidden>⚠️</span>
              {selectedModel.name} doesn&apos;t support character tagging. Tagged
              references will be ignored.
            </p>
          )}

        {/* Chips das personas taggeadas (face lock) — só quando o modelo suporta */}
        {activeTab === "video" &&
          supportsCharacterTagging &&
          resolvedTagged.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {resolvedTagged.map((p) => (
                <span
                  key={p.id}
                  title="Used as face reference (locked)"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#7C3AED]/40 bg-[#7C3AED]/10 py-0.5 pl-0.5 pr-2 text-[11px] text-[#C4B5FD]"
                >
                  <span className="relative h-5 w-5 overflow-hidden rounded-full bg-[#2A2A2A]">
                    {p.avatar_image_url ? (
                      <Image
                        src={p.avatar_image_url}
                        alt={p.handle}
                        fill
                        sizes="20px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </span>
                  @{p.handle.replace(/^@/, "")}
                  <Lock className="h-3 w-3 text-[#A78BFA]" />
                </span>
              ))}
            </div>
          )}

        {/* Negative prompt (vídeo) */}
        {!collapsed && activeTab === "video" && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[#888888]">
              Negative Prompt
            </label>
            <textarea
              value={negativePrompt}
              maxLength={2000}
              rows={2}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="Negative prompt (optional)"
              className="w-full resize-none rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-sm leading-5 text-[#F5F5F5] outline-none placeholder:text-[#666666] focus:border-[#3A3A3A]"
            />
          </div>
        )}

        {/* Segmentada Start/End Frame | Omni Reference (vídeo) */}
        {!collapsed && activeTab === "video" && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-1">
            <button
              type="button"
              onClick={() => setReferenceTab("start-end")}
              className={cn(
                "h-10 rounded-lg text-sm transition-colors duration-150",
                referenceTab === "start-end"
                  ? "bg-[#7C3AED]/15 font-medium text-white ring-1 ring-[#7C3AED]/50"
                  : "text-[#8b8b93] hover:text-white"
              )}
            >
              Start / End Frame
            </button>
            <button
              type="button"
              onClick={() => setReferenceTab("omni")}
              className={cn(
                "h-10 rounded-lg text-sm transition-colors duration-150",
                referenceTab === "omni"
                  ? "bg-[#7C3AED]/15 font-medium text-white ring-1 ring-[#7C3AED]/50"
                  : "text-[#8b8b93] hover:text-white"
              )}
            >
              Omni Reference
            </button>
          </div>
        )}

        {/* Start / End Frame */}
        {!collapsed && activeTab === "video" && referenceTab === "start-end" && (
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => startInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-white/5 px-3 py-2 text-xs text-[#c9c9d1] transition-colors duration-150 hover:bg-white/10"
            >
              {startImageUrl && (
                <Image
                  src={startImageUrl}
                  alt="Start frame"
                  width={18}
                  height={18}
                  className="rounded-sm"
                  unoptimized
                />
              )}
              Start Frame
            </button>
            <button
              type="button"
              onClick={() => {
                const previousStart = startImageUrl;
                setStartImageUrl(endImageUrl);
                setEndImageUrl(previousStart);
              }}
              className="text-xs text-[#666666]"
              title="Swap frames"
            >
              ⇄
            </button>
            <button
              type="button"
              onClick={() => endInputRef.current?.click()}
              className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-white/5 px-3 py-2 text-xs text-[#c9c9d1] transition-colors duration-150 hover:bg-white/10"
            >
              {endImageUrl && (
                <Image
                  src={endImageUrl}
                  alt="End frame"
                  width={18}
                  height={18}
                  className="rounded-sm"
                  unoptimized
                />
              )}
              End Frame
            </button>
          </div>
        )}

        {/* Aviso de responsabilidade — modelo "Rosto Real" com imagem anexada */}
        {!collapsed && activeTab === "video" && isRealFaceModel && hasAnyImageRef && (
          <p className="mb-3 text-[11px] leading-relaxed text-[#888888]">
            Use apenas imagens com consentimento do titular. A responsabilidade
            pelo uso é do usuário.
          </p>
        )}

        {/* Dica de prompt — Seedance com imagem de referência */}
        {!collapsed && isSeedanceWithImage && (
          <p className="mb-3 text-[11px] leading-relaxed text-[#666666]">
            Dica: mencione a imagem no prompt, por ex. “@image1 é a pessoa de
            referência”.
          </p>
        )}

        {/* Multi-Shot (storyboard) — só Kling 3.0 */}
        {!collapsed && activeTab === "video" && supportsMultiShot && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMultiShotEnabled((v) => !v)}
                className={cn(
                  "relative h-5 w-10 shrink-0 rounded-full transition-colors duration-200",
                  multiShotEnabled ? "bg-[#7C3AED]" : "bg-[#2A2A2A]"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                    multiShotEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
              <div>
                <p className="text-sm text-[#F5F5F5]">
                  Multi-Shot (up to 6 scenes)
                </p>
                {multiShotEnabled && (
                  <p className="text-[11px] text-[#666666]">
                    Storyboard shots — each with prompt + duration (max 6 shots,
                    15s total)
                  </p>
                )}
              </div>
            </div>

            {multiShotEnabled && (
              <div className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-[#666666]">
                      SEQUENCE
                    </span>
                    <span
                      title="AUTO: model designs the storyboard. CUSTOM: you author each shot's prompt + duration. Total ≤ 15s across all shots."
                      className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[#444444] text-[10px] text-[#666666]"
                    >
                      i
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {(["auto", "custom"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMultiShotMode(m)}
                        className={cn(
                          "rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors",
                          multiShotMode === m
                            ? "bg-[#2A2A2A] text-[#F5F5F5]"
                            : "text-[#555555] hover:text-[#F5F5F5]"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {multiShotMode === "auto" && (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-[#888888]">Shots</span>
                        <span className="text-xs text-[#888888]">
                          {autoShotCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAutoShotCount((v) => Math.max(1, v - 1))
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-[#d0d0d0] transition-colors hover:bg-white/5"
                        >
                          −
                        </button>
                        <input
                          type="range"
                          min={1}
                          max={6}
                          value={autoShotCount}
                          onChange={(e) =>
                            setAutoShotCount(Number(e.target.value))
                          }
                          className="flex-1 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setAutoShotCount((v) => Math.min(6, v + 1))
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-[#d0d0d0] transition-colors hover:bg-white/5"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-[#888888]">Per Shot</span>
                        <span className="text-xs text-[#888888]">
                          {autoShotDuration}s
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAutoShotDuration((v) => Math.max(3, v - 1))
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-[#d0d0d0] transition-colors hover:bg-white/5"
                        >
                          −
                        </button>
                        <input
                          type="range"
                          min={3}
                          max={15}
                          value={autoShotDuration}
                          onChange={(e) =>
                            setAutoShotDuration(Number(e.target.value))
                          }
                          className="flex-1 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setAutoShotDuration((v) => Math.min(15, v + 1))
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-[#d0d0d0] transition-colors hover:bg-white/5"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-[#555555]">
                        Total: {autoShotCount * autoShotDuration}s
                      </p>
                    </div>
                  </div>
                )}

                {multiShotMode === "custom" && (
                  <div className="space-y-2">
                    {customShots.map((shot, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-[#242428] bg-[#141416] p-2.5"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] text-[#8b8b93]">
                            Shot {i + 1}
                          </span>
                          {customShots.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setCustomShots((prev) =>
                                  prev.filter((_, j) => j !== i)
                                )
                              }
                              className="text-sm leading-none text-[#444444] hover:text-red-400"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <textarea
                          value={shot.prompt}
                          onChange={(e) =>
                            setCustomShots((prev) =>
                              prev.map((s, j) =>
                                j === i ? { ...s, prompt: e.target.value } : s
                              )
                            )
                          }
                          placeholder={`Shot ${i + 1} scene description...`}
                          rows={2}
                          className="mb-2 w-full resize-none rounded-lg border border-[#2A2A2A] bg-[#101012] px-2.5 py-1.5 text-xs leading-5 text-[#F5F5F5] outline-none placeholder:text-[#444444] focus:border-[#444444]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCustomShots((prev) =>
                                prev.map((s, j) =>
                                  j === i
                                    ? { ...s, duration: Math.max(3, s.duration - 1) }
                                    : s
                                )
                              )
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-xs text-[#d0d0d0] transition-colors hover:bg-white/5"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-xs text-[#F5F5F5]">
                            {shot.duration}s
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomShots((prev) =>
                                prev.map((s, j) =>
                                  j === i
                                    ? { ...s, duration: Math.min(15, s.duration + 1) }
                                    : s
                                )
                              )
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-xs text-[#d0d0d0] transition-colors hover:bg-white/5"
                          >
                            +
                          </button>
                          <input
                            type="range"
                            min={3}
                            max={15}
                            step={1}
                            value={shot.duration}
                            onChange={(e) =>
                              setCustomShots((prev) =>
                                prev.map((s, j) =>
                                  j === i
                                    ? { ...s, duration: Number(e.target.value) }
                                    : s
                                )
                              )
                            }
                            className="flex-1 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                          />
                        </div>
                      </div>
                    ))}

                    {/* Barra de duração total (X/15s) */}
                    {(() => {
                      const total = customShots.reduce(
                        (s, sh) => s + sh.duration,
                        0
                      );
                      const over = total > 15;
                      return (
                        <div className="rounded-lg border border-[#242428] bg-[#141416] p-2.5">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] text-[#8b8b93]">
                              Total duration
                            </span>
                            <span
                              className={cn(
                                "text-[11px]",
                                over ? "text-red-400" : "text-[#8b8b93]"
                              )}
                            >
                              {total} / 15s
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-[#2A2A2A]">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                over ? "bg-red-500" : "bg-[#7C3AED]"
                              )}
                              style={{
                                width: `${Math.min(100, (total / 15) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1.5 text-[10px] text-[#666666]">
                            Min 3s per shot for stable results
                          </p>
                        </div>
                      );
                    })()}

                    <div className="pt-1">
                      <button
                        type="button"
                        disabled={customShots.length >= 6}
                        onClick={() =>
                          setCustomShots((prev) => [
                            ...prev,
                            { prompt: "", duration: 5 },
                          ])
                        }
                        className="text-xs text-[#7C3AED] hover:text-[#9F67FF] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Add Shot +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Seções de referência (Omni / Reference imagem) */}
        {!collapsed && showReferenceSections && (
          <div className="mb-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                    Reference Images ({referenceImages.length}/9)
                  </p>
                  <Popover
                    onOpenChange={(open) => {
                      if (open) void loadSeeds();
                    }}
                    triggerClassName="h-7 rounded-md px-2 text-xs"
                    panelClassName="left-auto right-0 mb-1 w-[280px] p-2"
                    trigger={() => (
                      <>
                        <Sprout className="h-3 w-3 text-[#9F67FF]" />
                        <span className="text-xs">Seeds</span>
                      </>
                    )}
                  >
                    {(close) => (
                      <div className="fx-scroll max-h-[min(40vh,300px)] overflow-y-auto pr-1">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                          Seus Seeds
                        </p>
                        {seedsLoading ? (
                          <div className="grid grid-cols-5 gap-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div
                                key={i}
                                className="h-12 w-12 animate-pulse rounded-md border border-[#2A2A2A] bg-[#232323]"
                              />
                            ))}
                          </div>
                        ) : seeds.length === 0 ? (
                          <p className="py-3 text-center text-xs text-[#777777]">
                            Nenhum seed salvo ainda.
                          </p>
                        ) : (
                          <div className="grid grid-cols-5 gap-2">
                            {seeds.map((seed) => (
                              <button
                                key={seed.id}
                                type="button"
                                onClick={() => {
                                  if (!seed.preview_url) {
                                    toast.error("Este seed não possui preview.");
                                    return;
                                  }
                                  addReferenceImage(seed.preview_url);
                                  void markSeedAsUsed(seed.id);
                                  toast.success(`Seed \"${seed.name || "Sem nome"}\" adicionada.`);
                                  close();
                                }}
                                className="group relative h-12 w-12 overflow-hidden rounded-md border border-[#2A2A2A] bg-[#1A1A1A]"
                                title={seed.name || "Seed"}
                              >
                                {seed.preview_url ? (
                                  <Image
                                    src={seed.preview_url}
                                    alt={seed.name || "Seed"}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[#666666]">
                                    <Sprout className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Popover>
                </div>
                {activeTab === "video" && (
                  <p className="text-[10px] text-[#666666]">
                    {totalRefs}/12 total
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {referenceImages.map((url, index) => (
                  <div key={`${url.slice(0, 32)}-${index}`} className="group relative">
                    <Image
                      src={url}
                      alt={`Reference ${index + 1}`}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-lg border border-[#2A2A2A] object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => removeReferenceImage(index)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#2A2A2A] text-[#F5F5F5] opacity-0 transition-opacity hover:bg-[#7C3AED] group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {referenceImages.length < 9 && (
                  <button
                    type="button"
                    onClick={() => refImageInputRef.current?.click()}
                    className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] text-[#666666] hover:border-[#7C3AED] hover:text-[#F5F5F5]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>



            {activeTab === "video" && (
              <>
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                    Reference Videos ({referenceVideos.length}/3)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {referenceVideos.map((url, index) => (
                      <div
                        key={`vid-${index}`}
                        className="relative flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
                      >
                        <Video className="h-3.5 w-3.5 text-[#888888]" />
                        Video {index + 1}
                        <button
                          type="button"
                          onClick={() => removeReferenceVideo(index)}
                          className="text-[#666666] hover:text-[#F5F5F5]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {referenceVideos.length < 3 && (
                      <button
                        type="button"
                        onClick={() => refVideoInputRef.current?.click()}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#888888] hover:border-[#7C3AED] hover:text-[#F5F5F5]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Import Video
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#666666]">
                    Reference Audio ({referenceAudios.length}/3)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {referenceAudios.map((url, index) => (
                      <div
                        key={`aud-${index}`}
                        className="relative flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#F5F5F5]"
                      >
                        <Music className="h-3.5 w-3.5 text-[#888888]" />
                        Audio {index + 1}
                        <button
                          type="button"
                          onClick={() => removeReferenceAudio(index)}
                          className="text-[#666666] hover:text-[#F5F5F5]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {referenceAudios.length < 3 && (
                      <button
                        type="button"
                        onClick={() => refAudioInputRef.current?.click()}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[#2A2A2A] bg-[#1A1A1A] px-3 text-xs text-[#888888] hover:border-[#7C3AED] hover:text-[#F5F5F5]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Import Audio
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Inputs de arquivo ocultos */}
        <input
          ref={startInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickFile(event, setStartImageUrl)}
        />
        <input
          ref={endInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handlePickFile(event, setEndImageUrl)}
        />
        <input
          ref={refImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void handlePickToList(event, addReferenceImage)}
        />
        <input
          ref={refVideoInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(event) => void handlePickToList(event, addReferenceVideo)}
        />
        <input
          ref={refAudioInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(event) => void handlePickToList(event, addReferenceAudio)}
        />

        {/* Toolbar */}
        <div className={cn("flex min-w-0 items-center gap-2 xl:flex-nowrap", collapsed && "hidden")}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 xl:flex-nowrap">
            {/* Modelo — menu hierárquico */}
            <Popover
              panelClassName="overflow-visible"
              trigger={() => (
                <>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-[#2A2A2A] text-[10px] font-semibold text-[#F5F5F5]">
                    {(selectedModel?.family || selectedModel?.name || "M").charAt(0)}
                  </span>
                  <span className="max-w-[120px] truncate">
                    {selectedModel?.name || "Select model"}
                  </span>
                  <ChevronUp className="h-3 w-3 text-[#666666]" />
                </>
              )}
            >
              {(close) => (
                <ModelMenu
                  groups={familyGroups}
                  selectedId={selectedModelId}
                  onSelect={(model) => {
                    selectModel(model);
                    close();
                  }}
                />
              )}
            </Popover>

            {/* Voz + sliders (TTS) */}
            {activeTab === "audio" && selectedModel?.kind === "tts" && (
              <>
                <VoiceSelector voiceId={ttsVoice} onSelect={setTtsVoice} />

                <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 py-1.5">
                  <span className="text-xs text-[#888888]">Stability</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={stability}
                    onChange={(e) => setStability(Number(e.target.value))}
                    className="h-1.5 w-16 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                  />
                  <span className="w-8 text-xs text-[#F5F5F5]">
                    {Math.round(stability * 100)}%
                  </span>
                </div>

                <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 py-1.5">
                  <span className="text-xs text-[#888888]">Similarity</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={similarity}
                    onChange={(e) => setSimilarity(Number(e.target.value))}
                    className="h-1.5 w-16 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                  />
                  <span className="w-8 text-xs text-[#F5F5F5]">
                    {Math.round(similarity * 100)}%
                  </span>
                </div>

                <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 py-1.5">
                  <span className="text-xs text-[#888888]">Speed</span>
                  <input
                    type="range"
                    min={0.1}
                    max={4}
                    step={0.05}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="h-1.5 w-16 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                  />
                  <span className="w-10 text-xs text-[#F5F5F5]">
                    {speed.toFixed(2)}x
                  </span>
                </div>
              </>
            )}

            {/* Aspect ratio */}
            {activeTab !== "audio" && (
              <Popover
                panelClassName="w-32"
                trigger={() => (
                  <>
                    <RatioIcon ratio={safeAspect} className="text-[#888888]" />
                    {safeAspect}
                    <ChevronUp className="h-3 w-3 text-[#666666]" />
                  </>
                )}
              >
                {(close) => (
                  <div className="fx-scroll max-h-[min(40vh,300px)] space-y-0.5 overflow-y-auto">
                    {aspectOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setAspectRatio(option);
                          close();
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                          option === safeAspect
                            ? "bg-[#2A2A2A] text-[#F5F5F5]"
                            : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                        )}
                      >
                        <RatioIcon ratio={option} />
                        <span className="flex-1 text-left">{option}</span>
                        {option === safeAspect && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}

            {/* Duração (vídeo) */}
            {activeTab === "video" && durationSnapValues && (
              <div className="flex h-9 items-center gap-1 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-1">
                {durationSnapValues.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    className={cn(
                      "h-7 rounded-md px-2 text-xs",
                      value === safeDuration
                        ? "bg-[#2A2A2A] font-medium text-[#F5F5F5]"
                        : "text-[#888888] hover:text-[#F5F5F5]"
                    )}
                  >
                    {value}s
                  </button>
                ))}
              </div>
            )}
            {activeTab === "video" && !durationSnapValues && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2.5 py-1.5">
                <input
                  type="range"
                  min={durMin}
                  max={durMax}
                  step={1}
                  value={safeDuration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="h-1.5 w-20 accent-[#7C3AED] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2A2A2A]"
                />
                <span className="text-xs text-[#F5F5F5]">{safeDuration}s</span>
              </div>
            )}

            {/* Resolução */}
            {activeTab !== "audio" && (
              <Popover
                panelClassName="w-24"
                trigger={() => (
                  <>
                    <Expand className="h-4 w-4 text-[#888888]" />
                    {safeResolution}
                    <ChevronUp className="h-3 w-3 text-[#666666]" />
                  </>
                )}
              >
                {(close) => (
                  <div className="fx-scroll max-h-[min(40vh,300px)] space-y-0.5 overflow-y-auto">
                    {resolutionOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setResolution(option);
                          close();
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                          option === safeResolution
                            ? "bg-[#2A2A2A] text-[#F5F5F5]"
                            : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                        )}
                      >
                        <span>{option}</span>
                        {option === safeResolution && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}

            {/* Quality (imagem/vídeo) */}
            {activeTab !== "audio" && (
              <Popover
                panelClassName="w-32"
                trigger={() => (
                  <>
                    <Gauge className="h-4 w-4 text-[#888888]" />
                    {QUALITY_LABELS[quality]}
                    <ChevronUp className="h-3 w-3 text-[#666666]" />
                  </>
                )}
              >
                {(close) => (
                  <div className="fx-scroll max-h-[min(40vh,300px)] space-y-0.5 overflow-y-auto">
                    {QUALITY_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setQuality(option);
                          close();
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                          option === quality
                            ? "bg-[#2A2A2A] text-[#F5F5F5]"
                            : "text-[#888888] hover:bg-[#222222] hover:text-[#F5F5F5]"
                        )}
                      >
                        <span>{QUALITY_LABELS[option]}</span>
                        {option === quality && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}

            {/* Áudio on/off (vídeo) — botão-ícone, igual aos demais controles */}
            {activeTab === "video" && selectedModel?.has_audio !== false && (
              <button
                type="button"
                onClick={() => {
                  const next = !audioEnabled;
                  setAudioEnabled(next);
                  toast.info(
                    next ? "Áudio do vídeo ativado." : "Áudio do vídeo desativado."
                  );
                }}
                title={
                  audioEnabled
                    ? "Áudio ativado — clique para desativar"
                    : "Áudio desativado — clique para ativar"
                }
                aria-pressed={audioEnabled}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2A2A] transition-colors duration-150",
                  audioEnabled
                    ? "bg-[#7C3AED]/15 text-[#A78BFA] ring-1 ring-[#7C3AED]/50"
                    : "bg-white/5 text-[#888888] hover:bg-white/10"
                )}
              >
                {audioEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {/* Batch (imagem) */}
            {activeTab === "image" && (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 text-sm text-[#F5F5F5]">
                <button
                  type="button"
                  onClick={() => setBatchCount(batchCount - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A1A1A] text-[#d0d0d0] transition-colors hover:bg-white/5"
                >
                  —
                </button>
                <span className="min-w-4 text-center text-sm font-medium text-[#F5F5F5]">{batchCount}</span>
                <button
                  type="button"
                  onClick={() => setBatchCount(batchCount + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A1A1A] text-[#d0d0d0] transition-colors hover:bg-white/5"
                >
                  +
                </button>
              </div>
            )}

            {/* @, Reference, Assist e Wise enhance não se aplicam ao áudio */}
            {activeTab !== "audio" && (
              <>
                {/* @ — assets */}
                <button
                  type="button"
                  title="Assets"
                  onClick={() => {
                    setAtOpen((value) => !value);
                    setAssistOpen(false);
                  }}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2A2A] bg-white/5 text-[#c9c9d1] transition-colors duration-150 hover:bg-white/10",
                    atOpen && "ring-1 ring-[#7C3AED]/50"
                  )}
                >
                  <AtSign className="h-3.5 w-3.5" />
                </button>

                {/* Reference */}
                <ControlButton
                  title="Reference"
                  iconOnly
                  active={
                    activeTab === "video"
                      ? referenceTab === "omni"
                      : refSectionOpen || referenceImages.length > 0
                  }
                  onClick={() => {
                    if (activeTab === "video") {
                      setReferenceTab(
                        referenceTab === "omni" ? "start-end" : "omni"
                      );
                    } else {
                      setRefSectionOpen((value) => !value);
                    }
                  }}
                  icon={<Upload className="h-3.5 w-3.5 text-[#888888]" />}
                  muted
                />

                {/* Assist */}
                <ControlButton
                  title="Assist"
                  iconOnly
                  active={assistOpen}
                  onClick={() => {
                    setAssistOpen((value) => !value);
                    setAtOpen(false);
                  }}
                  icon={<SlidersHorizontal className="h-3.5 w-3.5 text-[#888888]" />}
                />

                {/* Wise enhance */}
                <ControlButton
                  title="Wise enhance"
                  iconOnly
                  icon={
                    enhancing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8B5CF6]" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-[#888888]" />
                    )
                  }
                  muted={!enhancing}
                  onClick={() => void handleWiseEnhance()}
                />
              </>
            )}
          </div>

          {/* Generate */}
          <div className="flex flex-shrink-0 flex-col items-end">
            <button
              type="submit"
              disabled={loading || insufficient}
              className={cn(
                "flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] px-5 py-2.5 text-sm font-medium text-white transition duration-200 hover:brightness-110 hover:shadow-[0_8px_30px_rgba(124,58,237,0.4)]",
                (loading || insufficient) && "cursor-not-allowed opacity-50 hover:brightness-100 hover:shadow-none"
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Generate
                  <Zap className="h-4 w-4" fill="currentColor" />
                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-semibold">⚡ {totalCost}</span>
                </>
              )}
            </button>
            {insufficient && (
              <span className="mt-1 text-[11px] text-[#888888]">
                Need {totalCost} credits. {credits ?? 0} available.
              </span>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
