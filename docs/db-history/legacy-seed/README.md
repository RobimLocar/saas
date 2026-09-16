# Legacy seed — archived, not executed

`seed-v2-stale.sql` (formerly `supabase/seed.sql`) belongs to an earlier,
abandoned schema iteration and does not match the current ratified schema:

- Its first statement inserts into `public.subscription_plans`, a table no
  migration in this repository creates.
- Its second statement inserts into `public.ai_models` using a column set
  (`slug`, `modality`, `provider_fallback`, `provider_model_id`, `credits`,
  `measured_api_cost_usd`, `is_premium`, ...) that does not match the real
  `ai_models` table (`id`, `name`, `provider`, `type`, `model_id`,
  `credit_cost`, `params`, `is_active`, `min_plan`, `sort_order`, ...) created
  by `supabase/migrations/20260821190000_historical_drift_capture.sql`.
- It must not be executed by the current Supabase Preview/CLI seeding step —
  it was the cause of a Preview seed failure (`relation
  "public.subscription_plans" does not exist"`).

Preserved here byte-for-byte, for history only. Not wired into any active
seed path.
