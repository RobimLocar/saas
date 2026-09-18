-- P5g2 — Kling Sound SFX Catalog (PREPARE-ONLY).
--
-- Decisões RATIFICADAS pelo Product Owner:
--   credit_cost = 8 · target gross margin = 40% (pior plano pago) · min_plan = free
-- Preço do provider revalidado ao vivo: $0.07 / generation (4 outputs) — sem DOC DRIFT.
--
-- O QUE FAZ:
--   1) Cria o SKU VERDADEIRO "Kling Sound Effects" (provider=piapi, backend=kling,
--      kind=sfx) — o primeiro SFX real do catálogo.
--   2) DESATIVA (is_active=false, NUNCA DELETE) os dois aliases falsos que hoje
--      roteiam para Qubico/ace-step: elevenlabs-sfx e mmaudio (legado).
--
-- INVARIANTES:
--   • NÃO toca generations / flows / saved_prompts (histórico permanece ACE-Step).
--   • NÃO reescreve UUID / model_id / nomes dos aliases.
--   • A tabela ai_models NÃO tem coluna updated_at; family/backend/kind vivem em params.
--   • model_id NÃO é UNIQUE → alvos por UUID EXATO + predicados de contrato.
--   • Fail-loud + idempotente: reexecução não duplica; divergência de contrato dos
--     alvos aborta a transação (RAISE), sem aplicação parcial.
--
-- ⚠ DEPLOYMENT GATE (NÃO aplicar em isolamento): as migrations
--   20260903110000_tts_catalog_consolidation e 20260903120000_tts_per_kchar_billing
--   continuam NÃO aplicadas. O migrador aplica toda a cadeia pendente em ordem de
--   timestamp, então aplicar ESTA ativa também o billing TTS per_kchar.
--   Cadeia pendente: 20260903110000 → 20260903120000 → 20260906130000 (esta).
--   APPLY GATE = NOT APPROVED até o Product Owner ratificar a cadeia TTS.

do $$
declare
  v_kling_uuid   uuid := 'b7e9c1a4-2d5f-4a8b-9c3e-1f0a6d8b4e72'; -- UUID FIXO (determinístico p/ rollback/auditoria)
  v_evsfx_uuid   uuid := '0465a3f1-01fa-4045-9a93-af6782e3c256'; -- elevenlabs-sfx (reconfirmado 2026-09-06)
  v_mmaudio_uuid uuid := '3d3e5f74-7341-4218-8fbe-0dd1f1c4b46b'; -- mmaudio legado (reconfirmado 2026-09-06)
  v_kling_count  int;
begin
  -- ── Precondition: alias elevenlabs-sfx ainda corresponde ao contrato ───────
  if not exists (
    select 1 from public.ai_models
    where id = v_evsfx_uuid
      and model_id = 'elevenlabs-sfx'
      and provider = 'atlas'
      and params->>'kind' = 'sfx'
      and params->>'backend' = 'Qubico/ace-step'
  ) then
    raise exception 'CATALOG CONTRACT MISMATCH: elevenlabs-sfx (uuid %) diverge do contrato esperado', v_evsfx_uuid;
  end if;

  -- ── Precondition: alias mmaudio legado ainda corresponde ao contrato ───────
  if not exists (
    select 1 from public.ai_models
    where id = v_mmaudio_uuid
      and model_id = 'mmaudio'
      and provider = 'piapi'
      and params->>'kind' = 'sfx'
      and params->>'backend' = 'Qubico/ace-step'
  ) then
    raise exception 'CATALOG CONTRACT MISMATCH: mmaudio (uuid %) diverge do contrato esperado', v_mmaudio_uuid;
  end if;

  -- ── Precondition Kling: duplicata / contrato errado → fail-loud ────────────
  select count(*) into v_kling_count from public.ai_models where model_id = 'kling-sound';
  if v_kling_count > 1 then
    raise exception 'KLING CATALOG DUPLICATE: % rows com model_id=kling-sound', v_kling_count;
  elsif v_kling_count = 1 then
    -- Só é idempotente se o row existente tiver EXATAMENTE o contrato ratificado.
    if not exists (
      select 1 from public.ai_models
      where model_id = 'kling-sound'
        and name = 'Kling Sound Effects'
        and provider = 'piapi'
        and type = 'audio'
        and credit_cost = 8
        and min_plan = 'free'
        and sort_order = 14
        and params->>'kind' = 'sfx'
        and params->>'backend' = 'kling'
        and params->>'family' = 'Kling'
    ) then
      raise exception 'KLING CATALOG CONTRACT MISMATCH: row kling-sound existente diverge do contrato ratificado';
    end if;
    -- Já existe com o contrato correto → nada a inserir (idempotente).
  else
    -- ── INSERT do SKU verdadeiro (contrato RATIFICADO) ───────────────────────
    insert into public.ai_models
      (id, name, model_id, provider, type, credit_cost, min_plan, sort_order, is_active, params)
    values (
      v_kling_uuid,
      'Kling Sound Effects',
      'kling-sound',
      'piapi',
      'audio',
      8,
      'free',
      14,
      true,
      jsonb_build_object(
        'kind', 'sfx',
        'backend', 'kling',
        'family', 'Kling',
        'family_description', 'AI sound effects from text prompts (4 variations)'
      )
    );
  end if;

  -- ── Desativar aliases falsos (NUNCA DELETE; alvo por UUID + contrato) ──────
  update public.ai_models
    set is_active = false
    where id = v_evsfx_uuid
      and model_id = 'elevenlabs-sfx'
      and params->>'backend' = 'Qubico/ace-step';

  update public.ai_models
    set is_active = false
    where id = v_mmaudio_uuid
      and model_id = 'mmaudio'
      and params->>'backend' = 'Qubico/ace-step';
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar aqui) ──────────────────────────────────
-- NUNCA DELETE o kling-sound após ativado (pode ter generations; FKs ON DELETE NO ACTION).
--   update public.ai_models set is_active = false where id = 'b7e9c1a4-2d5f-4a8b-9c3e-1f0a6d8b4e72'; -- desativa Kling
--   update public.ai_models set is_active = true  where id = '0465a3f1-01fa-4045-9a93-af6782e3c256'; -- reativa elevenlabs-sfx
--   update public.ai_models set is_active = true  where id = '3d3e5f74-7341-4218-8fbe-0dd1f1c4b46b'; -- reativa mmaudio
-- generations / flows / saved_prompts permanecem INTOCADOS em qualquer direção.
