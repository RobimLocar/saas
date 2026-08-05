// Regras de negócio do Fluxyra (v2.0) — §5 e §6 da documentação.

export const WELCOME_CREDITS = 10;

// Câmbio de referência e stress test (§5.6)
export const FX_REFERENCE_BRL = 5.5;
export const FX_STRESS_BRL = 6.5;
export const FX_REVIEW_TRIGGER_BRL = 6.2;

// Margem mínima por modelo, calculada no pior caso (plano Agency) (§5.1)
export const MIN_MARGIN = 0.4;

// Cooldown de 30s para gerações acima de 10 créditos (§4, §6)
export const HIGH_COST_THRESHOLD_CREDITS = 10;
export const HIGH_COST_COOLDOWN_SECONDS = 30;
export const FREE_PLAN_COST_MULTIPLIER = 2.5;

// Multiplicador de CONSUMO de créditos por plano (não altera o preço-base das IAs;
// só faz a mesma geração consumir mais créditos nos planos menores).
// Escada agressiva: free 2,5x · básico(starter) 1,8x · pro 1,3x · agency 1x.
// Planos desconhecidos (ex.: "base" da landing) pagam 1x.
export const PLAN_COST_MULTIPLIER: Record<string, number> = {
  free: 2.5,
  starter: 1.8,
  pro: 1.3,
  agency: 1,
};

// Alertas de saldo (§6)
export const LOW_BALANCE_TOAST_PCT = 0.2; // toast < 20%
export const LOW_BALANCE_EMAIL_PCT = 0.1; // e-mail < 10%

// Polling de gerações (§1.4 — React Query polling a cada 3s)
export const GENERATION_POLL_INTERVAL_MS = 3000;

// Top-ups (§5.5) — créditos avulsos não expiram
export const TOPUP_PACKS = [
  { credits: 100, price_brl: 39 },
  { credits: 300, price_brl: 99 },
  { credits: 700, price_brl: 199 },
  { credits: 1500, price_brl: 379 },
] as const;

export const MODALITIES = ["image", "video", "audio"] as const;
