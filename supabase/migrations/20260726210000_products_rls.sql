-- ============================================================
-- Migration: products RLS — Etapa 4c-1
-- ============================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- SELECT
DO $$
BEGIN
  CREATE POLICY products_select_own
    ON public.products
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- INSERT
DO $$
BEGIN
  CREATE POLICY products_insert_own
    ON public.products
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- UPDATE
DO $$
BEGIN
  CREATE POLICY products_update_own
    ON public.products
    FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- DELETE
DO $$
BEGIN
  CREATE POLICY products_delete_own
    ON public.products
    FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
