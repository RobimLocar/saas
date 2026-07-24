# Schema de Produção — Fluxyra

> Fonte de verdade: banco hospedado no Supabase (projeto `pckfdyrhksdkwakptyuk`).
> Este documento reflete o schema **real em uso** (inspecionado em 23/07/2026).
> O código em `src/` está alinhado a estas tabelas/colunas.

## Tabelas

### `profiles` (1:1 com `auth.users`)
| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid PK | = auth.users.id |
| email | text | |
| credits_balance | integer | saldo de créditos |
| stripe_customer_id | text | |
| plan | text | `free` / `starter` / `pro` / `agency` |
| plan_credits_monthly | integer | créditos mensais do plano |
| created_at | timestamptz | |

Trigger de cadastro: cria o profile com **10 créditos de boas-vindas** (testado e funcionando).

### `ai_models` (catálogo — 29 modelos ativos)
| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid PK | |
| name | text | ex.: "Flux Dev" |
| provider | text | `piapi` / `atlas` |
| type | text | `image` / `video` / `audio` |
| model_id | text | id no provider, ex.: `flux-dev` — usado como "slug" pela API |
| credit_cost | integer | créditos por geração |
| params | jsonb | family, width/height etc. |
| is_active | boolean | |
| thumbnail_url | text | |
| min_plan | text | plano mínimo (gating) |
| sort_order | integer | |

### `generations` (histórico/fila de gerações)
| Coluna | Tipo |
|---|---|
| id, user_id, model_id (FK ai_models) | uuid |
| type | `image`/`video`/`audio` |
| prompt, negative_prompt | text |
| params | jsonb |
| status | `pending`/`processing`/`completed`/`failed` |
| result_url | text |
| provider_task_id | text |
| credits_used | integer |
| error_message | text |
| created_at, updated_at | timestamptz |

### `generation_jobs` (tabela legada da v1 — mantida para histórico)
Colunas: modality, provider, model, model_variant, prompt, params, status,
external_job_id, result_url, thumbnail_url, credits_cost, error_message.

### `assets` (biblioteca de mídias do usuário)
| Coluna | Tipo |
|---|---|
| id, user_id | uuid |
| category | text (`image`/`video`/`audio`/`custom`) |
| name | text |
| image_url | text (URL pública da mídia) |
| created_at | timestamptz |

### `credit_transactions` (ledger)
| Coluna | Tipo |
|---|---|
| id, user_id | uuid |
| amount | integer (+ entrada / − saída) |
| reason | text (`welcome`/`subscription`/`topup`/`generation`/`refund`/...) |
| related_job_id | uuid |
| created_at | timestamptz |

### `credit_purchases` (top-ups Stripe)
user_id, stripe_session_id, credits, amount_cents, status.

### `subscriptions` (assinaturas Stripe)
user_id, stripe_subscription_id, stripe_price_id, plan, status,
current_period_start/end, cancel_at_period_end.

### `products` (UGC Factory)
user_id, title, description, image_url.

## Storage
- Bucket `uploads` (público) — uploads de referência do usuário.
- Bucket `assets` (público) — mídias geradas persistidas pelo webhook.

## Convenções no código
- A API de geração recebe `model_slug` no body = **`ai_models.model_id`** (ex.: `flux-dev`).
- Gating de plano: `min_plan` do modelo vs `profiles.plan` (`src/lib/plans.ts`).
- Reembolso automático em falha: `+credit_cost` com `reason='refund'`.
