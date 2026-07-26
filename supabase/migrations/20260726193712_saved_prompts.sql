-- ============================================================
-- Migration: saved_prompts — Etapa 4a (11 colunas)
-- ⚠️ COMO APLICAR: cole no SQL Editor do Supabase
--    (projeto pckfdyrhksdkwakptyuk) e clique em RUN.
-- ============================================================

-- 1. Criar tabela com as 11 colunas definitivas
CREATE TABLE IF NOT EXISTS public.saved_prompts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            TEXT,
  prompt           TEXT        NOT NULL,
  negative_prompt  TEXT,
  type             TEXT        CHECK (type IN ('image','video','audio','any')),
  tags             TEXT[]      DEFAULT '{}',
  default_model_id UUID,
  use_count        INTEGER     DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índice por dono
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_id
  ON public.saved_prompts(user_id);

-- 3. Habilitar RLS
ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS: usuário só vê e modifica os próprios registros
CREATE POLICY "sp_select_own" ON public.saved_prompts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "sp_insert_own" ON public.saved_prompts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sp_update_own" ON public.saved_prompts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "sp_delete_own" ON public.saved_prompts
  FOR DELETE USING (auth.uid() = user_id);
