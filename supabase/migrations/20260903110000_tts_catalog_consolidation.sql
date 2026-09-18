-- P5d1 — TTS Catalog Consolidation (Atlas ElevenLabs v3)
--
-- Os 3 SKUs TTS atuais (elevenlabs-flash / elevenlabs-turbo-v2.5 /
-- elevenlabs-multilingual-v2) apontam para o MESMO provider model real
-- (elevenlabs/v3/text-to-speech) — 3 identidades de produto para 1 modelo.
-- Esta migration consolida em 1 SKU verdadeiro:
--   SURVIVOR = elevenlabs-flash (único referenciado por 1 Flow salvo).
--
-- Regras (P5d1-SAFETY):
--   • NUNCA DELETE — FKs generations.model_id / saved_prompts.default_model_id
--     são ON DELETE NO ACTION; deletar quebraria/bloquearia histórico. Só desativa.
--   • NÃO altera UUID, model_id, provider, backend, atlas_model, kind, family,
--     credit_cost nem sort_order do survivor. Só o display `name` muda.
--   • NÃO ativa billing per_kchar (segue FLAT). A ativação do billing dinâmico é
--     a migration 20260903120000 (survivor-only), aplicada só após P5-FINAL.
--   • NÃO toca generations, flows nem saved_prompts.
--
-- Timestamp 110000 < 120000 (billing) → esta consolidação roda ANTES do billing.
-- Idempotente (rerun define os mesmos valores). A tabela ai_models NÃO tem
-- coluna updated_at (só created_at) — por isso não a referenciamos.

-- Survivor: apenas renomeia o display name (identidade técnica preservada).
update public.ai_models
set name = 'ElevenLabs v3 Text-to-Speech'
where type = 'audio' and model_id = 'elevenlabs-flash';

-- Duplicados: desativar (NUNCA DELETE). Somem de /api/models, histórico intacto.
update public.ai_models
set is_active = false
where type = 'audio'
  and model_id in ('elevenlabs-turbo-v2.5', 'elevenlabs-multilingual-v2');

-- Rollback conceitual (NÃO executar aqui):
--   update public.ai_models set is_active = true
--     where type='audio' and model_id in ('elevenlabs-turbo-v2.5','elevenlabs-multilingual-v2');
--   update public.ai_models set name = 'ElevenLabs Flash'
--     where type='audio' and model_id='elevenlabs-flash';
