-- DATA-API-GRANTS-PARITY-01 — restore Data API table/sequence grants on fresh branches.
--
-- Supabase docs (branching/troubleshooting, branching/working-with-branches,
-- api/securing-your-api): new database branches are created WITHOUT default
-- privileges on the public schema, regardless of the base project's setting.
-- GRANT and Row Level Security are two independent checks — PostgREST/the
-- Data API refuses to reach a table at all without an explicit GRANT, no
-- matter how permissive its RLS policies are. A fresh Preview branch built
-- purely from migrations (no dashboard/manual grant history) can therefore
-- return 42501 "permission denied" for tables whose RLS is fully correct,
-- exactly as observed for public.ai_models on this Preview branch.
--
-- This migration restores table + sequence access to anon/authenticated/
-- service_role, matching what Production already has. RLS remains the
-- authoritative row-level gate for every table — this migration does not
-- add, remove, or alter a single policy, and does not touch RLS enablement.
-- Function EXECUTE privileges remain explicitly managed per-function (the
-- service-role-only RPCs — debit/refund/webhook-claim/trial-claim, etc. —
-- are untouched); this migration grants nothing on functions.

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select, update
  on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select, update
  on sequences
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete
  on tables
  to anon, authenticated, service_role;
