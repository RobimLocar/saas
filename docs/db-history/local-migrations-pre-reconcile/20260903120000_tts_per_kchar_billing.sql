-- P5d1b — TTS Dynamic Per-Character Billing (Atlas ElevenLabs v3)
--
-- Adiciona a configuração de cobrança POR CARACTERE ao SURVIVOR TTS.
-- ATUALIZADO em P5d1: após a consolidação (20260903110000), só o survivor
-- (model_id = 'elevenlabs-flash', renomeado "ElevenLabs v3 Text-to-Speech")
-- permanece ativo; os duplicados foram desativados. Por isso o WHERE agora
-- é SURVIVOR-ONLY (não mais os 3 SKUs). Roda DEPOIS da consolidação (120000 > 110000).
-- NÃO altera UUID, model_id, name, is_active nem credit_cost.
--
-- ATIVAÇÃO: continua NÃO aplicada. Só deve ser aplicada após a verificação real
-- de char-semantics e a ratificação de produto (P5-FINAL). Enquanto não aplicada,
-- billing_mode fica ausente e a route mantém o comportamento FLAT.
--
-- Contrato do provider (Atlas ElevenLabs v3, confirmado na página do modelo):
--   list price = $0.10 / 1.000 caracteres · máx 5.000 chars · cobrança proporcional.
-- Política Fluxyra: base_credits_per_kchar = 12 (nível Agency, gross margin >= 40%
--   no pior caso Agency mensal). effectiveCost(base, plano) aplica o multiplicador.
--
-- Campos:
--   billing_mode                 = "per_kchar"  → ativa o custo dinâmico na route
--   provider_price_per_kchar_usd = 0.10         → list price do provider (auditoria)
--   base_credits_per_kchar       = 12           → RATE de créditos-base (nível Agency)
--   pricing_version              = tag para auditoria financeira
--
-- Fail-closed: enquanto esta migration NÃO for aplicada, billing_mode fica ausente
-- e a route mantém o comportamento flat atual (sem undercharge silencioso novo).

update public.ai_models
set params = coalesce(params, '{}'::jsonb) || jsonb_build_object(
  'billing_mode', 'per_kchar',
  'provider_price_per_kchar_usd', 0.10,
  'base_credits_per_kchar', 12,
  'pricing_version', 'atlas-elevenlabs-v3-kchar-v1'
)
where type = 'audio'
  and is_active = true
  and model_id = 'elevenlabs-flash'
  and (params->>'kind') = 'tts'
  and (params->>'backend') = 'atlas-tts';

-- Rollback conceitual (não executar aqui) — SURVIVOR-ONLY:
--   update public.ai_models
--   set params = (params - 'billing_mode' - 'provider_price_per_kchar_usd'
--                        - 'base_credits_per_kchar' - 'pricing_version')
--   where type='audio' and model_id='elevenlabs-flash'
--     and params->>'kind'='tts' and params->>'backend'='atlas-tts';
