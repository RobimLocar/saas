-- ============================================================
-- Migration: ugc_projects — Etapa 4c-2
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ugc_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  avatar_seed_id uuid REFERENCES public.seeds(id) ON DELETE SET NULL,
  avatar_label text,
  script jsonb,
  segments jsonb,
  broll jsonb,
  status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ugc_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY ugc_proj_select_own
    ON public.ugc_projects
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY ugc_proj_insert_own
    ON public.ugc_projects
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY ugc_proj_update_own
    ON public.ugc_projects
    FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY ugc_proj_delete_own
    ON public.ugc_projects
    FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_ugc_projects_set_updated_at'
      AND tgrelid = 'public.ugc_projects'::regclass
  ) THEN
    CREATE TRIGGER trg_ugc_projects_set_updated_at
    BEFORE UPDATE ON public.ugc_projects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;
