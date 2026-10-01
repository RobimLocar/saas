-- Forward-only: amplia o CHECK de credit_transactions.reason para os valores
-- já usados por grant_topup_credits ('topup') e grant_subscription_credits
-- ('subscription') desde 20260906160000_billing_atomicity.
alter table public.credit_transactions
  drop constraint credit_transactions_reason_check,
  add constraint credit_transactions_reason_check
  check (reason in ('purchase','generation','refund','bonus','topup','subscription'));
