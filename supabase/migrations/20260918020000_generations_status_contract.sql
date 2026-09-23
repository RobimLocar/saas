-- GENERATIONS-STATUS-CONTRACT-01 — reconcile generations.status CHECK with the
-- current, live application status vocabulary.
--
-- Root cause (proven live against Production pckfdyrhksdkwakptyuk + Preview
-- pygyqycxusfadmppfjvr + exhaustive grep of every write to
-- public.generations.status in src/app/api/generate/**, src/app/api/ugc/**,
-- src/app/api/influencers/**, src/app/api/webhooks/**, src/lib/webhooks/**):
--
-- Production carries `generations_status_check CHECK (status = ANY
-- (ARRAY['pending','processing','completed','failed']))` — a constraint that
-- predates this migration history entirely. The historical bridge
-- (20260821190000_historical_drift_capture.sql) creates public.generations
-- with `status text default 'pending'` and NO check constraint at all, so a
-- fresh Preview reproduces zero status constraint (confirmed: `select
-- pg_get_constraintdef(...) from pg_constraint where conrelid=
-- 'public.generations'::regclass and contype='c'` returns no status-related
-- row on Preview). 20260907140000_video_reliability.sql — the migration that
-- shipped the RELIABILITY code path now writing status='submitting' and
-- status='submission_unknown' (src/app/api/generate/video/route.ts) — only
-- ever added columns (generation_intent_id, request_fingerprint,
-- callback_token, next_provider_poll_at) and never touched any status
-- constraint. Neither environment's constraint (stale-present in Production,
-- entirely-absent in Preview) matches the six values the app actually
-- writes today.
--
-- Existing-data proof (read-only, before writing this migration): Production
-- public.generations currently holds only status IN ('completed','failed')
-- (295 / 6 rows); Preview holds only ('failed') (1 row). Both are fully
-- compatible with the six-value set below — this migration changes no rows.
--
-- Canonical six-value vocabulary (from code, not assumed):
--   pending              — src/app/api/generate/{image,audio,removebg,upscale,video}/route.ts (initial insert)
--   processing           — src/app/api/generate/video/route.ts, src/app/api/generate/status/route.ts, src/lib/webhooks/processor.ts
--   submitting            — src/app/api/generate/video/route.ts (claim_generation_intent path, before provider dispatch)
--   submission_unknown    — src/app/api/generate/video/route.ts (VIDEO-RELIABILITY-01: provider dispatch outcome unknown, e.g. timeout)
--   completed             — src/app/api/generate/status/route.ts, src/lib/webhooks/processor.ts
--   failed                — every generate/webhook route (validation, provider error, persistence failure, refund path)
--
-- Idempotent for every starting state this migration may run against:
-- DROP CONSTRAINT IF EXISTS is a no-op on a fresh Preview (no such
-- constraint exists there today) and correctly removes Production's stale
-- 4-value constraint before the ADD CONSTRAINT below recreates it with the
-- current 6-value contract. No row is read, changed, or deleted.
--
-- Out of scope (per this task's own instruction, reported separately, not
-- folded in here): ai_models_provider_check, ai_models_type_check,
-- ai_models_min_plan_check, generations_type_check, saved_prompts_type_check
-- — same class of gap, lower severity, not proven to block anything today.
alter table public.generations
  drop constraint if exists generations_status_check;

alter table public.generations
  add constraint generations_status_check
  check (status in ('pending', 'processing', 'submitting', 'submission_unknown', 'completed', 'failed'));
