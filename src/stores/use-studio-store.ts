import { create } from "zustand";

type Modality = "image" | "video" | "audio";

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
  selectedModelSlug: string;
  setSelectedModelSlug: (slug: string) => void;

  // Parâmetros de geração
  aspectRatio: string;
  setAspectRatio: (val: string) => void;
  duration: number;
  setDuration: (val: number) => void;
  resolution: string;
  setResolution: (val: string) => void;

  // Referências
  referenceImageUrl: string | null;
  setReferenceImageUrl: (url: string | null) => void;
  startImageUrl: string | null;
  setStartImageUrl: (url: string | null) => void;
  endImageUrl: string | null;
  setEndImageUrl: (url: string | null) => void;

  // Galeria
  viewFilter: "all" | Modality;
  setViewFilter: (filter: "all" | Modality) => void;

  // Gatilho de atualização da galeria (incrementado após cada geração)
  refreshKey: number;
  triggerRefresh: () => void;

  // Reset
  resetParams: () => void;
}

// model_id reais (provider PiAPI) do catálogo ai_models
const DEFAULT_MODELS: Record<Modality, string> = {
  image: "Qubico/flux1-schnell",
  video: "seedance-2",
  audio: "Qubico/ace-step",
};

export const useStudioStore = create<StudioState>((set) => ({
  activeTab: "image",
  setActiveTab: (tab) =>
    set({ activeTab: tab, selectedModelSlug: DEFAULT_MODELS[tab] }),

  prompt: "",
  setPrompt: (prompt) => set({ prompt }),
  negativePrompt: "",
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),

  selectedModelSlug: "Qubico/flux1-schnell",
  setSelectedModelSlug: (selectedModelSlug) => set({ selectedModelSlug }),

  aspectRatio: "1:1",
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  duration: 4,
  setDuration: (duration) => set({ duration }),
  resolution: "1080p",
  setResolution: (resolution) => set({ resolution }),

  referenceImageUrl: null,
  setReferenceImageUrl: (referenceImageUrl) => set({ referenceImageUrl }),
  startImageUrl: null,
  setStartImageUrl: (startImageUrl) => set({ startImageUrl }),
  endImageUrl: null,
  setEndImageUrl: (endImageUrl) => set({ endImageUrl }),

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
      referenceImageUrl: null,
      startImageUrl: null,
      endImageUrl: null,
    }),
}));
