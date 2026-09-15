// Fundação multi-provider (P1) — SOMENTE tipos/interface. Zero impacto.
// Não altera geração, Studio, Flow, billing, catálogo, nem os clients existentes.
// Nenhuma rota consome isto ainda; nenhum adapter real foi criado.

/** Id de provider (ex.: "piapi", "atlas"); extensível a qualquer string. */
export type ProviderId = string;

/** Entrada CANÔNICA (provider-agnóstica). Todos os campos são opcionais;
 *  cada adapter traduz para o payload do seu provider. */
export interface CanonicalInput {
  prompt?: string;
  negativePrompt?: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  images?: string[];
  videos?: string[];
  audio?: string;
  seed?: number;
  metadata?: Record<string, unknown>;
}

/** Tarefa de geração pronta para um provider específico. */
export interface GenTask {
  canonicalId: string;          // identidade canônica ESTÁVEL (chave de ProviderOffer)
  requestId?: string;           // correlação EFÊMERA de uma execução (logs/tracing)
  type: "video" | "image" | "audio";
  input: CanonicalInput;
  providerModelId: string;
  providerTaskType?: string;
  params: Record<string, unknown>;
  webhook?: {
    endpoint: string;
    secret: string;
  };
}

/** Resultado do submit (criação da task). */
export interface SubmitResult {
  providerTaskId: string;
  status: string;
}

/** Resultado normalizado de status (poll/webhook). */
export interface StatusResult {
  status: string;
  resultUrl?: string;
  /** P5g1 — fundação multi-output (DORMENTE): um provider pode legitimamente
   *  produzir múltiplos áudios (ex.: Kling Sound = 4 MP3). Opcional; nenhum
   *  adapter atual o preenche, então todos permanecem single-output. */
  resultUrls?: string[];
  usage?: {
    consume?: number;
  };
  error?: string;
}

/** Contrato comum de um provider de geração. */
export interface Provider {
  id: ProviderId;
  submit(task: GenTask): Promise<SubmitResult>;
  getStatus(providerTaskId: string): Promise<StatusResult>;
}

/** Política de seleção de provider para um modelo canônico. */
export type ProviderSelectionPolicy = "priority" | "cheapest" | "manual";

/** Oferta de um modelo canônico por um provider (futuro: alimentada pelo catálogo). */
export interface ProviderOffer {
  canonicalId: string;
  provider: ProviderId;
  providerModelId: string;
  providerTaskType?: string;
  priority?: number;        // menor = preferido (policy "priority")
  pricePerSecond?: number;  // usado por policy "cheapest"
  params?: Record<string, unknown>;
}

/** Entrada de resolveProviderOffer(). */
export interface ResolveOfferInput {
  canonicalId: string;
  policy: ProviderSelectionPolicy;
}
