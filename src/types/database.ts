// Tipos do schema do Supabase (Fluxyra v2).
// Reflete supabase/migrations/0001_init.sql. Pode ser regenerado depois via
// `supabase gen types typescript`.

export type Modality = "image" | "video" | "audio";
export type GenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded";
export type PlanCode = "free" | "starter" | "pro" | "agency";
export type CreditTxnType =
  | "welcome"
  | "subscription"
  | "topup"
  | "generation"
  | "refund"
  | "referral"
  | "adjustment";

export interface SubscriptionPlan {
  id: string;
  code: PlanCode;
  name: string;
  price_brl: number;
  monthly_credits: number;
  daily_limit: number;
  parallel_generations: number;
  rollover_cap: number;
  pix_enabled: boolean;
  nfe_required: boolean;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface AiModel {
  id: string;
  slug: string;
  name: string;
  modality: Modality;
  provider: string;
  provider_fallback: string | null;
  provider_model_id: string | null;
  credits: number;
  measured_api_cost_usd: number | null;
  cost_last_verified_at: string | null;
  description: string | null;
  thumbnail_url: string | null;
  is_premium: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  credits_balance: number;
  plan_code: PlanCode;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_renews_at: string | null;
  daily_generations_used: number;
  daily_reset_at: string;
  onboarding_completed: boolean;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id: string;
  user_id: string;
  model_id: string | null;
  modality: Modality;
  prompt: string | null;
  negative_prompt: string | null;
  params: Record<string, unknown>;
  status: GenerationStatus;
  provider: string | null;
  provider_task_id: string | null;
  credits_charged: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  user_id: string;
  generation_id: string | null;
  modality: Modality;
  storage_path: string;
  thumbnail_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  is_favorite: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Seed {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  reference_asset_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SavedPrompt {
  id: string;
  user_id: string;
  title: string | null;
  prompt: string;
  modality: Modality | null;
  tags: string[];
  created_at: string;
}

export interface Flow {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  is_template: boolean;
  definition: Record<string, unknown>;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: CreditTxnType;
  balance_after: number | null;
  generation_id: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  referred_email: string | null;
  status: string;
  credits_awarded: number;
  converted_at: string | null;
  created_at: string;
}
