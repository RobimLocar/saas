-- ============================================================
-- Fluxyra — Seed data (v2.0)
-- Planos de assinatura (§5.1) + catálogo de lançamento (§5.2, créditos v2)
-- ============================================================

-- ---------- Planos ----------
insert into public.subscription_plans
  (code, name, price_brl, monthly_credits, daily_limit, parallel_generations, rollover_cap, pix_enabled, nfe_required, features, sort_order)
values
  ('free',    'Free',    0,     10,   3,   1, 0,   false, false,
    '["10 créditos de boas-vindas","3 gerações/dia","Acesso a todos os modelos padrão"]'::jsonb, 0),
  ('starter', 'Starter', 97,    450,  50,  2, 0,   true,  true,
    '["450 créditos/mês","50 gerações/dia","2 gerações simultâneas","Todos os modelos padrão","Pix e NF-e"]'::jsonb, 1),
  ('pro',     'Pro',     197,   1100, 150, 4, 100, true,  true,
    '["1.100 créditos/mês","150 gerações/dia","4 gerações simultâneas","Rollover até 100 créditos","Todos os modelos padrão","Pix e NF-e"]'::jsonb, 2),
  ('agency',  'Agency',  497,   3200, 500, 6, 500, true,  true,
    '["3.200 créditos/mês","500 gerações/dia","6 gerações simultâneas","Rollover até 500 créditos","Todos os modelos padrão","Pix e NF-e","Suporte prioritário"]'::jsonb, 3)
on conflict (code) do update set
  price_brl = excluded.price_brl,
  monthly_credits = excluded.monthly_credits,
  daily_limit = excluded.daily_limit,
  parallel_generations = excluded.parallel_generations,
  rollover_cap = excluded.rollover_cap,
  pix_enabled = excluded.pix_enabled,
  nfe_required = excluded.nfe_required,
  features = excluded.features,
  sort_order = excluded.sort_order;

-- ---------- Catálogo de lançamento (7 modelos) ----------
insert into public.ai_models
  (slug, name, modality, provider, provider_fallback, provider_model_id, credits, measured_api_cost_usd, description, is_premium, sort_order)
values
  ('flux-schnell', 'Flux Schnell', 'image', 'piapi', 'fal-ai', 'flux-schnell', 1, 0.0020,
    'Iteração rápida — geração de imagem em segundos.', false, 0),
  ('flux-dev', 'Flux Dev', 'image', 'piapi', 'fal-ai', 'flux-dev', 1, 0.0120,
    'Alta qualidade para imagens finais.', false, 1),
  ('gpt-image-2', 'GPT Image 2', 'image', 'piapi', null, 'gpt-image-2', 1, 0.0090,
    'Excelente para texto dentro da imagem.', false, 2),
  ('kling-standard', 'Kling Standard', 'video', 'piapi', 'fal-ai', 'kling-std-4s', 8, 0.1240,
    'Vídeo custo-benefício (4s).', false, 3),
  ('seedance-2-fast', 'Seedance 2.0 Fast', 'video', 'piapi', 'fal-ai', 'seedance-2-fast-4s', 20, 0.3200,
    'Vídeo de qualidade premium (4s).', false, 4),
  ('elevenlabs-v3', 'ElevenLabs v3', 'audio', 'piapi', null, 'elevenlabs-v3', 6, 0.1000,
    'Text-to-speech de alta fidelidade (TTS).', false, 5),
  ('suno-chirp-v5', 'Suno chirp-v5', 'audio', 'piapi', null, 'suno-chirp-v5', 8, 0.1320,
    'Geração de música.', false, 6)
on conflict (slug) do update set
  name = excluded.name,
  credits = excluded.credits,
  measured_api_cost_usd = excluded.measured_api_cost_usd,
  provider_fallback = excluded.provider_fallback,
  description = excluded.description,
  sort_order = excluded.sort_order;
