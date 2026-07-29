-- ============================================================
-- 0002 — RPCs de crédito: débito atômico + estorno idempotente (§3.3)
-- ============================================================
-- Alinhado ao schema de PRODUÇÃO (supabase/SCHEMA_PRODUCAO.md):
--   profiles.credits_balance (integer)
--   credit_transactions(user_id, amount, reason text, related_job_id uuid)
--   reason do débito = 'generation'  ·  reason do estorno = 'refund'
--
-- ⚠️ COMO APLICAR: o banco hospedado NÃO expõe DDL pela service role, então
-- este arquivo NÃO pôde ser aplicado automaticamente. Aplique no Supabase
-- (SQL Editor do projeto pckfdyrhksdkwakptyuk) e, depois de criado, o código
-- pode migrar de src/lib/credits.ts para chamadas supabase.rpc('debit_credits'|'refund_credits').
-- Enquanto não aplicado, as MESMAS garantias já rodam em src/lib/credits.ts.
-- ============================================================

-- Débito atômico: subtrai apenas se saldo suficiente; registra no ledger.
CREATE OR REPLACE FUNCTION public.debit_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_job_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET credits_balance = credits_balance - p_amount
  WHERE id = p_user_id AND credits_balance >= p_amount
  RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  INSERT INTO public.credit_transactions(user_id, amount, reason, related_job_id)
  VALUES (p_user_id, -p_amount, 'generation', p_job_id);

  RETURN v_new_balance;
END;
$$;

-- Estorno idempotente: só credita de volta se ainda não houver refund para o job.
CREATE OR REPLACE FUNCTION public.refund_credits(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_amount  INTEGER;
  v_exists  BOOLEAN;
BEGIN
  -- Idempotência: já existe refund para este job?
  SELECT EXISTS(
    SELECT 1 FROM public.credit_transactions
    WHERE related_job_id = p_job_id AND reason = 'refund'
  ) INTO v_exists;

  IF v_exists THEN
    RETURN FALSE; -- já estornado, não faz nada
  END IF;

  -- Buscar o débito original (reason 'generation').
  SELECT user_id, ABS(amount) INTO v_user_id, v_amount
  FROM public.credit_transactions
  WHERE related_job_id = p_job_id AND reason = 'generation'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
  SET credits_balance = credits_balance + v_amount
  WHERE id = v_user_id;

  INSERT INTO public.credit_transactions(user_id, amount, reason, related_job_id)
  VALUES (v_user_id, v_amount, 'refund', p_job_id);

  RETURN TRUE;
END;
$$;
