-- BILLING-REVERSALS-02 — o webhook (service role) precisa executar os RPCs de
-- estorno. Em Produção, funções novas em public NÃO recebem EXECUTE para
-- service_role por default privileges (confirmado: proacl ficou só com
-- postgres=X). As demais funções de cobrança recebem o grant explícito
-- (20260906160000, 20260907120000, 20260907140000); estas duas faltaram.
-- Idempotente.
grant execute on function public.reverse_purchase_credits(text, text, numeric, boolean, text) to service_role;
grant execute on function public.reinstate_dispute_credits(text, text, text) to service_role;
