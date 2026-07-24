// Tipos globais do Fluxyra — a serem expandidos

export type Modality = "image" | "video" | "audio";

export interface Asset {
  id: string;
  userId: string;
  modality: Modality;
  url: string;
  createdAt: string;
}

export interface CreditBalance {
  userId: string;
  credits: number;
}
