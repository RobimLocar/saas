import { create } from "zustand";

type Modality = "image" | "video" | "audio";
type ReferenceTab = "start-end" | "omni";
/** Udio (music-u) — modo SEMÂNTICO da UI (mapeado a lyrics_type no backend). */
export type MusicMode = "ai-vocals" | "instrumental" | "custom-lyrics";
/** ACE-Step Music (Qubico/ace-step) — modo SEMÂNTICO (mapeado a lyrics no backend). */
export type AceMusicMode = "instrumental" | "lyrics";
/** Kling Sound SFX — duração oficial (segundos). Enum: 5 | 10. */
export type SfxDuration = 5 | 10;

interface StudioState {
  // Aba ativa
  activeTab: Modality;
  setActiveTab: (tab: Modality) => void;

  // Prompt
  prompt: string;
  setPrompt: (prompt: string) => void;
  negativePrompt: string;
  setNegativePrompt: (val: string) => void;

  // Modelo selecionado
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;

  // Parâmetros de geração
  aspectRatio: string;
  setAspectRatio: (val: string) => void;
  duration: number;
  setDuration: (val: number) => void;
  resolution: string;
  setResolution: (val: string) => void;
  quality: "low" | "medium" | "high";
  setQuality: (val: "low" | "medium" | "high") => void;
  batchCount: number;
  setBatchCount: (n: number) => void;

  // Áudio / voz (TTS)
  ttsVoice: string; // id da voz de exibição
  setTtsVoice: (id: string) => void;
  stability: number; // 0–1
  setStability: (v: number) => void;

  // Áudio / música (Udio — music-u). musicMode default "instrumental".
  musicMode: MusicMode;
  setMusicMode: (m: MusicMode) => void;
  lyrics: string; // letra custom (só no modo custom-lyrics) — NÃO traduzida
  setLyrics: (v: string) => void;
  negativeTags: string; // tags a evitar (avançado)
  setNegativeTags: (v: string) => void;
  seed: string; // seed opcional (avançado); string na UI, parseada no submit
  setSeed: (v: string) => void;

  // Áudio / música (ACE-Step — Qubico/ace-step). aceMusicMode default "instrumental".
  // `lyrics` acima é COMPARTILHADO (letra de canção, mesmo semântico do Udio).
  aceMusicMode: AceMusicMode;
  setAceMusicMode: (m: AceMusicMode) => void;
  aceNegativePrompt: string; // negative_prompt oficial (avançado) — NÃO traduzido
  setAceNegativePrompt: (v: string) => void;

  // Áudio / SFX (Kling Sound). sfxDuration default 5 (default de PRODUTO/UI).
  sfxDuration: SfxDuration;
  setSfxDuration: (v: SfxDuration) => void;

  // Áudio / MMAudio (Qubico/mmaudio, video2audio). Vídeo de origem (URL pública)
  // + duração (client-side, só UX) + negative prompt scoped. Não persistido.
  mmaudioVideoUrl: string | null;
  setMmaudioVideoUrl: (url: string | null) => void;
  mmaudioVideoDuration: number | null;
  setMmaudioVideoDuration: (d: number | null) => void;
  mmaudioNegativePrompt: string;
  setMmaudioNegativePrompt: (v: string) => void;

  // Referências
  referenceImageUrl: string | null;
  setReferenceImageUrl: (url: string | null) => void;
  startImageUrl: string | null;
  setStartImageUrl: (url: string | null) => void;
  endImageUrl: string | null;
  setEndImageUrl: (url: string | null) => void;
  referenceTab: ReferenceTab;
  setReferenceTab: (tab: ReferenceTab) => void;

  // Listas de mídia de referência (Omni Reference)
  referenceImages: string[]; // max 9
  addReferenceImage: (url: string) => void;
  removeReferenceImage: (index: number) => void;
  referenceVideos: string[]; // max 3
  addReferenceVideo: (url: string) => void;
  removeReferenceVideo: (index: number) => void;
  referenceAudios: string[]; // max 3
  addReferenceAudio: (url: string) => void;
  removeReferenceAudio: (index: number) => void;

  // Galeria
  viewFilter: "all" | Modality;
  setViewFilter: (filter: "all" | Modality) => void;

  // Gatilho de atualização da galeria (incrementado após cada geração)
  refreshKey: number;
  triggerRefresh: () => void;

  // Cards optimistas: aparecem imediatamente ao clicar Generate, antes da resposta do servidor
  optimisticCount: number;
  optimisticType: Modality;
  optimisticAspect: string;
  addOptimistic: (type: Modality, aspect: string, count?: number) => void;
  clearOptimistic: () => void;

  // Reset
  resetParams: () => void;
}

// UUIDs (id) da tabela ai_models
const DEFAULT_MODELS: Record<Modality, string> = {
  image: "",
  video: "",
  audio: "",
};

export const useStudioStore = create<StudioState>((set) => ({
  activeTab: "image",
  setActiveTab: (tab) =>
    set({ activeTab: tab, selectedModelId: DEFAULT_MODELS[tab] }),

  prompt: "",
  setPrompt: (prompt) => set({ prompt }),
  negativePrompt: "",
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),

  selectedModelId: "",
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),

  aspectRatio: "1:1",
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  duration: 4,
  setDuration: (duration) => set({ duration }),
  resolution: "1080p",
  setResolution: (resolution) => set({ resolution }),
  quality: "high",
  setQuality: (quality) => set({ quality }),
  batchCount: 4,
  setBatchCount: (batchCount) =>
    set({ batchCount: Math.max(1, Math.min(4, Math.floor(batchCount || 1))) }),

  ttsVoice: "EXAVITQu4vr4xnSDxMaL", // Savannah
  setTtsVoice: (ttsVoice) => set({ ttsVoice }),
  stability: 0.3,
  setStability: (stability) => set({ stability }),

  musicMode: "instrumental",
  setMusicMode: (musicMode) => set({ musicMode }),
  lyrics: "",
  setLyrics: (lyrics) => set({ lyrics }),
  negativeTags: "",
  setNegativeTags: (negativeTags) => set({ negativeTags }),
  seed: "",
  setSeed: (seed) => set({ seed }),

  aceMusicMode: "instrumental",
  setAceMusicMode: (aceMusicMode) => set({ aceMusicMode }),
  aceNegativePrompt: "",
  setAceNegativePrompt: (aceNegativePrompt) => set({ aceNegativePrompt }),

  sfxDuration: 5,
  setSfxDuration: (sfxDuration) => set({ sfxDuration }),

  mmaudioVideoUrl: null,
  setMmaudioVideoUrl: (mmaudioVideoUrl) => set({ mmaudioVideoUrl }),
  mmaudioVideoDuration: null,
  setMmaudioVideoDuration: (mmaudioVideoDuration) => set({ mmaudioVideoDuration }),
  mmaudioNegativePrompt: "",
  setMmaudioNegativePrompt: (mmaudioNegativePrompt) => set({ mmaudioNegativePrompt }),

  referenceImageUrl: null,
  setReferenceImageUrl: (referenceImageUrl) =>
    set((s) => ({
      referenceImageUrl,
      // Mantém compatibilidade: também adiciona à lista de imagens de referência
      referenceImages:
        referenceImageUrl &&
        !s.referenceImages.includes(referenceImageUrl) &&
        s.referenceImages.length < 9
          ? [...s.referenceImages, referenceImageUrl]
          : s.referenceImages,
    })),
  startImageUrl: null,
  setStartImageUrl: (startImageUrl) => set({ startImageUrl }),
  endImageUrl: null,
  setEndImageUrl: (endImageUrl) => set({ endImageUrl }),
  referenceTab: "start-end",
  setReferenceTab: (referenceTab) => set({ referenceTab }),

  referenceImages: [],
  addReferenceImage: (url) =>
    set((s) =>
      s.referenceImages.length < 9 && !s.referenceImages.includes(url)
        ? { referenceImages: [...s.referenceImages, url] }
        : {}
    ),
  removeReferenceImage: (index) =>
    set((s) => ({
      referenceImages: s.referenceImages.filter((_, i) => i !== index),
    })),
  referenceVideos: [],
  addReferenceVideo: (url) =>
    set((s) =>
      s.referenceVideos.length < 3
        ? { referenceVideos: [...s.referenceVideos, url] }
        : {}
    ),
  removeReferenceVideo: (index) =>
    set((s) => ({
      referenceVideos: s.referenceVideos.filter((_, i) => i !== index),
    })),
  referenceAudios: [],
  addReferenceAudio: (url) =>
    set((s) =>
      s.referenceAudios.length < 3
        ? { referenceAudios: [...s.referenceAudios, url] }
        : {}
    ),
  removeReferenceAudio: (index) =>
    set((s) => ({
      referenceAudios: s.referenceAudios.filter((_, i) => i !== index),
    })),

  viewFilter: "all",
  setViewFilter: (viewFilter) => set({ viewFilter }),

  refreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

  optimisticCount: 0,
  optimisticType: "image",
  optimisticAspect: "1:1",
  addOptimistic: (type, aspect, count = 1) => set({ optimisticCount: count, optimisticType: type, optimisticAspect: aspect }),
  clearOptimistic: () => set({ optimisticCount: 0 }),

  resetParams: () =>
    set({
      prompt: "",
      negativePrompt: "",
      aspectRatio: "1:1",
      duration: 4,
      resolution: "1080p",
      quality: "high",
      batchCount: 4,
      musicMode: "instrumental",
      lyrics: "",
      negativeTags: "",
      seed: "",
      aceMusicMode: "instrumental",
      aceNegativePrompt: "",
      sfxDuration: 5,
      mmaudioVideoUrl: null,
      mmaudioVideoDuration: null,
      mmaudioNegativePrompt: "",
      referenceImageUrl: null,
      startImageUrl: null,
      endImageUrl: null,
      referenceTab: "start-end",
      referenceImages: [],
      referenceVideos: [],
      referenceAudios: [],
    }),
}));
