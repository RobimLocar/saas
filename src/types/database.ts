// Tipos do schema do Supabase — refletem o banco de PRODUÇÃO do Fluxyra
// (projeto pckfdyrhksdkwakptyuk). O banco hospedado é a fonte de verdade.

export type Modality = "image" | "video" | "audio";
export type GenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded";
export type PlanCode = "free" | "starter" | "pro" | "agency";

/** Motivos usados no ledger de créditos (coluna `reason`). */
export type CreditReason =
  | "welcome"
  | "subscription"
  | "topup"
  | "purchase"
  | "generation"
  | "refund"
  | "adjustment";

/** Catálogo de modelos de IA (tabela `ai_models`). */
export interface AiModel {
  id: string;
  name: string;
  provider: string; // 'piapi' | 'atlas' | ...
  type: Modality; // modalidade do modelo
  model_id: string; // identificador do modelo no provider (ex.: 'flux-dev')
  credit_cost: number; // créditos cobrados por geração
  params: Record<string, unknown>;
  is_active: boolean;
  thumbnail_url: string | null;
  min_plan: PlanCode; // plano mínimo para usar o modelo
  sort_order: number;
  created_at: string;
}

/** Perfil do usuário (tabela `profiles`, 1:1 com auth.users). */
export interface Profile {
  id: string;
  email: string | null;
  credits_balance: number;
  stripe_customer_id: string | null;
  plan: PlanCode;
  plan_credits_monthly: number;
  created_at: string;
}

/** Fila/histórico de gerações (tabela `generations`). */
export interface Generation {
  id: string;
  user_id: string;
  model_id: string | null; // FK -> ai_models.id
  type: Modality;
  prompt: string | null;
  negative_prompt: string | null;
  params: Record<string, unknown>;
  status: GenerationStatus;
  result_url: string | null;
  provider_task_id: string | null;
  credits_used: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Jobs de geração (tabela legada `generation_jobs`, usada pela v1). */
export interface GenerationJob {
  id: string;
  user_id: string;
  modality: Modality;
  provider: string;
  model: string;
  model_variant: string | null;
  prompt: string | null;
  params: Record<string, unknown>;
  status: string;
  external_job_id: string | null;
  result_url: string | null;
  thumbnail_url: string | null;
  credits_cost: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Biblioteca de mídias do usuário (tabela `assets`). */
export interface Asset {
  id: string;
  user_id: string;
  category: string; // 'image' | 'video' | 'audio' | 'custom' | ...
  name: string | null;
  image_url: string | null; // URL pública da mídia
  created_at: string;
}

/** Produtos do usuário (tabela `products` — UGC Factory). */
export interface Product {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

/** Ledger de créditos (tabela `credit_transactions`). */
export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number; // + entrada, - saída
  reason: CreditReason | string;
  related_job_id: string | null;
  created_at: string;
}

/** Compras avulsas de créditos (tabela `credit_purchases`). */
export interface CreditPurchase {
  id: string;
  user_id: string;
  stripe_session_id: string | null;
  credits: number;
  amount_cents: number;
  status: string;
  created_at: string;
}

/** Assinaturas Stripe (tabela `subscriptions`). */
export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan: PlanCode;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}
