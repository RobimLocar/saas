import { create } from "zustand";

interface StudioState {
  prompt: string;
  setPrompt: (prompt: string) => void;
}

// TODO: expandir estado do Studio
export const useStudioStore = create<StudioState>((set) => ({
  prompt: "",
  setPrompt: (prompt) => set({ prompt }),
}));
