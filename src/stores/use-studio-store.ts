import { create } from "zustand";

type Modality = "image" | "video" | "audio";
type ReferenceTab = "start-end" | "omni";

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
  batchCount: number;
  setBatchCount: (n: number) => void;

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
  batchCount: 4,
  setBatchCount: (batchCount) =>
    set({ batchCount: Math.max(1, Math.min(4, Math.floor(batchCount || 1))) }),

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

  resetParams: () =>
    set({
      prompt: "",
      negativePrompt: "",
      aspectRatio: "1:1",
      duration: 4,
      resolution: "1080p",
      batchCount: 4,
      referenceImageUrl: null,
      startImageUrl: null,
      endImageUrl: null,
      referenceTab: "start-end",
      referenceImages: [],
      referenceVideos: [],
      referenceAudios: [],
    }),
}));
