-- PROFILES-STRIPE-CUSTOMER-PARITY-01 — add the profiles.stripe_customer_id
-- column that Stripe checkout/portal/webhook code already depends on.
--
-- Root cause (proven live against Preview pygyqycxusfadmppfjvr vs Production
-- pckfdyrhksdkwakptyuk + exhaustive migration grep): src/app/api/stripe/
-- create-checkout/route.ts, src/app/api/stripe/create-portal/route.ts and
-- src/lib/stripe/webhook-processor.ts all select/update
-- profiles.stripe_customer_id, and src/types/database.ts declares it on the
-- Profile type — but no migration in supabase/migrations/ ever creates this
-- column (grep for "stripe_customer_id" across supabase/migrations/*.sql:
-- zero matches; it only exists in the archived, non-applied files under
-- docs/db-history/local-migrations-pre-reconcile/). Production has the
-- column (confirmed via read-only information_schema query: text, nullable,
-- with a UNIQUE index profiles_stripe_customer_id_key) because it was added
-- outside this migration history, same pattern already fixed once for
-- profiles.plan / profiles.plan_credits_monthly by
-- 20260917210000_profiles_schema_parity.sql. A fresh branch built purely
-- from these migrations does not have it, so /api/stripe/create-checkout,
-- /api/stripe/create-portal, and the subscription-updated/deleted webhook
-- handlers in webhook-processor.ts would all fail with an undefined-column
-- error the first time a user attempts to subscribe or manage billing.
--
-- Scope: adds the single missing column with Production's proven type/
-- nullability/uniqueness. Does not touch RLS, other grants, billing RPCs,
-- the historical bridge, or any other migration.
alter table public.profiles
  add column if not exists stripe_customer_id text;

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id);

-- NOTE (documented, not fixed here — see PROFILES-OWN-POLICY-NOT-COPIED
-- finding in the CORE-END-TO-END-RECONSTRUCTION-01 certificate): Production
-- also carries a `profiles_own` RLS policy (cmd=ALL, using auth.uid()=id,
-- with_check=null) not present in this migration history. That policy is
-- intentionally NOT reproduced here: combined with Production's unrestricted
-- table-level GRANT (authenticated has full arwd on public.profiles, no
-- column-level restriction), it would let any authenticated user rewrite
-- their own credits_balance/plan/plan_credits_monthly directly via the
-- anon-key client — a privilege-escalation risk, not a contract requirement.
-- The one legitimate authenticated-client write this app actually needs
-- (stripe_customer_id, from create-checkout) is fixed instead by routing
-- that specific write through the service-role client (see the CORE code
-- change in the same commit as this migration), matching the established
-- pattern used for every other privileged profiles mutation in this codebase
-- (src/lib/stripe/webhook-processor.ts, src/lib/credits.ts). Copying
-- Production's profiles_own policy verbatim is explicitly out of scope per
-- this task's security gate ("não copiar stale Production behavior").
