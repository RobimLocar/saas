-- P5h2 — MMAudio Video-to-Audio Catalog (PREPARE-ONLY).
--
-- Decisões RATIFICADAS pelo Product Owner:
--   credit_cost = 2 · min_plan = free · kind = video-to-audio · prompt required · billing FLAT
-- Preço do provider em DOC CONFLICT (API $0.0005/s vs product/workspace $0.00005/s);
--   o owner ratificou usando o HIGH-RATE ($0.0005/s, custo máx 30s = $0.015) como safety
--   bound → base 2 dá ~50% GM no pior plano pago (Agency) e é robusto sob AMBOS os preços.
--
-- O QUE FAZ:
--   Cria o SKU VERDADEIRO "MMAudio Video to Audio" (provider=piapi, backend=Qubico/mmaudio,
--   kind=video-to-audio) — o primeiro video2audio real do catálogo.
--
-- INVARIANTES:
--   • NÃO toca generations / flows / saved_prompts.
--   • NÃO modifica o alias LEGADO `mmaudio` (backend Qubico/ace-step). A desativação do
--     legado é responsabilidade EXCLUSIVA da migration Kling (20260906130000). Aqui o
--     legado é apenas ASSERTADO (read-only); nunca alterado.
--   • ai_models NÃO tem updated_at; family/backend/kind vivem em params; model_id NÃO é UNIQUE.
--   • Fail-loud + idempotente: reexecução não duplica; divergência de contrato aborta (RAISE).
--
-- ⚠ DEPLOYMENT GATE (NÃO aplicar em isolamento): as migrations
--   20260903110000 (TTS consolidation), 20260903120000 (TTS per_kchar billing) e
--   20260906130000 (Kling catalog) continuam NÃO aplicadas. O migrador aplica toda a
--   cadeia pendente em ordem de timestamp, então aplicar ESTA ativa também as anteriores
--   (incl. o billing TTS per_kchar e a desativação dos aliases SFX pela Kling).
--   Cadeia: 110000 → 120000 → 130000 (Kling) → 140000 (esta). APPLY GATE = NOT APPROVED.

do $$
declare
  v_mm_uuid      uuid := 'c3f2a1b8-4d6e-4f19-8a2c-7b5e0d9c3a41'; -- UUID FIXO (determinístico p/ rollback/auditoria)
  v_legacy_uuid  uuid := '3d3e5f74-7341-4218-8fbe-0dd1f1c4b46b'; -- legacy mmaudio (reconfirmado 2026-09-06)
  v_mm_count     int;
begin
  -- ── Precondition READ-ONLY: legacy `mmaudio` ainda é o alias ACE-Step esperado ──
  -- (NÃO modifica o row; só garante que o namespace não sofreu drift inesperado.)
  if not exists (
    select 1 from public.ai_models
    where id = v_legacy_uuid
      and model_id = 'mmaudio'
      and params->>'backend' = 'Qubico/ace-step'
  ) then
    raise exception 'LEGACY MMAUDIO CONTRACT DRIFT: legacy mmaudio (uuid %) não corresponde ao contrato ACE-Step esperado', v_legacy_uuid;
  end if;

  -- ── Precondition: duplicata / contrato errado do novo SKU → fail-loud ──────
  select count(*) into v_mm_count from public.ai_models where model_id = 'mmaudio-video2audio';
  if v_mm_count > 1 then
    raise exception 'MMAUDIO CATALOG DUPLICATE: % rows com model_id=mmaudio-video2audio', v_mm_count;
  elsif v_mm_count = 1 then
    -- Só idempotente se o row existente tiver EXATAMENTE o contrato ratificado.
    if not exists (
      select 1 from public.ai_models
      where model_id = 'mmaudio-video2audio'
        and name = 'MMAudio Video to Audio'
        and provider = 'piapi'
        and type = 'audio'
        and credit_cost = 2
        and min_plan = 'free'
        and sort_order = 41
        and params->>'kind' = 'video-to-audio'
        and params->>'backend' = 'Qubico/mmaudio'
        and params->>'family' = 'MMAudio'
    ) then
      raise exception 'MMAUDIO CATALOG CONTRACT MISMATCH: row mmaudio-video2audio existente diverge do contrato ratificado';
    end if;
    -- Já existe com o contrato correto → nada a inserir (idempotente).
  else
    -- ── INSERT do SKU verdadeiro (contrato RATIFICADO) ───────────────────────
    insert into public.ai_models
      (id, name, model_id, provider, type, credit_cost, min_plan, sort_order, is_active, params)
    values (
      v_mm_uuid,
      'MMAudio Video to Audio',
      'mmaudio-video2audio',
      'piapi',
      'audio',
      2,
      'free',
      41,
      true,
      jsonb_build_object(
        'kind', 'video-to-audio',
        'backend', 'Qubico/mmaudio',
        'family', 'MMAudio',
        'family_description', 'Generate synchronized audio from video'
      )
    );
  end if;
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar aqui) ──────────────────────────────────
-- NUNCA DELETE o mmaudio-video2audio após ativado (pode ter generations; FKs NO ACTION).
--   update public.ai_models set is_active = false where id = 'c3f2a1b8-4d6e-4f19-8a2c-7b5e0d9c3a41';
-- NÃO reativar o legacy `mmaudio` aqui — a titularidade do estado do legado é da
-- migration Kling (20260906130000). generations/flows/saved_prompts permanecem INTOCADOS.
