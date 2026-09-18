-- P6d — Video Catalog ID Truth (PREPARE-ONLY).
--
-- Objetivo: alinhar model_id ao PROVIDER/produto REAL, renomeando IN PLACE (UUID e
-- histórico preservados), e tornar o display do Seedance 2.5 verdadeiro. NÃO toca
-- billing (credit_cost/credit_per_second/credit_cost_map), backend, task_type,
-- UUID, generations, flows ou saved_prompts.
--
-- Renames (model_id STRING, mesma row/UUID):
--   seedance-1.5-pro  → seedance-2.0-mini   (SKU real = Seedance 2 Mini; task seedance-2-mini)
--   wan-2.1-video     → wan-2.6             (SKU real = Wan 2.6; task wan26-txt2video)
-- Display truth (SEM mudar model_id/task/billing):
--   "Seedance 2.5 (Preview)" → "Seedance 2.5 — Rosto Real"
--     (a row ATIVA usa task_type seedance-2.5-less-restriction; o rótulo passa a
--      comunicar less-restriction no MESMO padrão do catálogo — cf. "Seedance 2.0
--      — Rosto Real". model_id seedance-2.5 permanece: é o único SKU 2.5 ativo.)
--
-- BACKWARD-COMPAT: o código (capabilities.ts / Flow VCAPS) resolve AMBOS os ids
-- (legado + canônico) via canonicalModelId(), então o runtime funciona ANTES e
-- DEPOIS desta migration — deploy da app e aplicação do DB são independentes.
--
-- INVARIANTES:
--   • ai_models NÃO tem updated_at; family/backend/task_type vivem em params.
--   • model_id NÃO é UNIQUE → antes de renomear, garantir que o id DESTINO não
--     existe em OUTRA row (fail-loud) e que a row FONTE bate no contrato esperado.
--   • Idempotente: reexecução após aplicada não duplica nem falha (aceita o estado novo).
--   • NÃO DELETE. NÃO altera UUID. NÃO altera Avatar (duplicata dormente fica intacta).
--
-- ⚠ DEPLOYMENT GATE (NÃO aplicar em isolamento): as migrations
--   20260903110000 (TTS consolidation), 20260903120000 (TTS per_kchar billing),
--   20260906130000 (Kling SFX catalog) e 20260906140000 (MMAudio catalog) seguem
--   NÃO aplicadas. O migrador aplica toda a cadeia pendente em ordem de timestamp,
--   então aplicar ESTA ativa também as anteriores. APPLY GATE = NOT APPROVED.

do $$
declare
  v_mini_uuid uuid := '9d08262e-4bb0-4dce-b830-cf2b73be2520'; -- Seedance 2.0 Mini (reconfirmado P6c)
  v_wan_uuid  uuid := 'b1736b24-1af5-45c9-b434-a7828f10cb31'; -- Wan 2.6 (reconfirmado P6c)
  v_s25_uuid  uuid := '95681446-db53-4689-91ac-fd11f27874a6'; -- Seedance 2.5 (Preview) (reconfirmado P6c)
begin
  -- ══════════════════════ 1) SEEDANCE MINI: seedance-1.5-pro → seedance-2.0-mini ══
  -- Precondition: destino não pode colidir com OUTRA row.
  if exists (
    select 1 from public.ai_models
    where model_id = 'seedance-2.0-mini' and id <> v_mini_uuid
  ) then
    raise exception 'SEEDANCE MINI RENAME COLLISION: model_id seedance-2.0-mini já existe em outra row';
  end if;

  if exists (select 1 from public.ai_models where id = v_mini_uuid and model_id = 'seedance-1.5-pro') then
    -- Estado LEGADO → valida contrato antes de migrar (fail-loud em drift).
    if not exists (
      select 1 from public.ai_models
      where id = v_mini_uuid
        and params->>'backend' = 'seedance'
        and params->>'task_type' = 'seedance-2-mini'
    ) then
      raise exception 'SEEDANCE MINI CONTRACT DRIFT: row % não corresponde ao contrato esperado (backend seedance / task seedance-2-mini)', v_mini_uuid;
    end if;
    update public.ai_models set model_id = 'seedance-2.0-mini' where id = v_mini_uuid;
  elsif exists (select 1 from public.ai_models where id = v_mini_uuid and model_id = 'seedance-2.0-mini') then
    null; -- já migrada (idempotente)
  else
    raise exception 'SEEDANCE MINI NOT FOUND / UNEXPECTED model_id na row %', v_mini_uuid;
  end if;

  -- ══════════════════════ 2) WAN: wan-2.1-video → wan-2.6 ═════════════════════════
  if exists (
    select 1 from public.ai_models
    where model_id = 'wan-2.6' and id <> v_wan_uuid
  ) then
    raise exception 'WAN RENAME COLLISION: model_id wan-2.6 já existe em outra row';
  end if;

  if exists (select 1 from public.ai_models where id = v_wan_uuid and model_id = 'wan-2.1-video') then
    if not exists (
      select 1 from public.ai_models
      where id = v_wan_uuid
        and params->>'backend' = 'Wan'
        and params->>'task_type' = 'wan26-txt2video'
    ) then
      raise exception 'WAN CONTRACT DRIFT: row % não corresponde ao contrato esperado (backend Wan / task wan26-txt2video)', v_wan_uuid;
    end if;
    update public.ai_models set model_id = 'wan-2.6' where id = v_wan_uuid;
  elsif exists (select 1 from public.ai_models where id = v_wan_uuid and model_id = 'wan-2.6') then
    null; -- já migrada
  else
    raise exception 'WAN NOT FOUND / UNEXPECTED model_id na row %', v_wan_uuid;
  end if;

  -- ══════════════════════ 3) SEEDANCE 2.5: display truth (SÓ name) ════════════════
  -- model_id / task_type / billing / UUID INTOCADOS. Só o rótulo passa a comunicar
  -- less-restriction (padrão do catálogo), em vez do genérico "(Preview)".
  if not exists (
    select 1 from public.ai_models
    where id = v_s25_uuid
      and model_id = 'seedance-2.5'
      and params->>'task_type' = 'seedance-2.5-less-restriction'
  ) then
    raise exception 'SEEDANCE 2.5 CONTRACT DRIFT: row % não é o SKU less-restriction esperado', v_s25_uuid;
  end if;
  update public.ai_models
    set name = 'Seedance 2.5 — Rosto Real'
    where id = v_s25_uuid and name <> 'Seedance 2.5 — Rosto Real';
end $$;

-- ── ROLLBACK CONCEITUAL (NÃO executar aqui) ──────────────────────────────────
-- Como o UUID é preservado, o rename é reversível sem perda:
--   update public.ai_models set model_id = 'seedance-1.5-pro' where id = '9d08262e-4bb0-4dce-b830-cf2b73be2520';
--   update public.ai_models set model_id = 'wan-2.1-video'    where id = 'b1736b24-1af5-45c9-b434-a7828f10cb31';
--   update public.ai_models set name = 'Seedance 2.5 (Preview)' where id = '95681446-db53-4689-91ac-fd11f27874a6';
-- O código mantém os aliases legados (canonicalModelId), então um rollback do DB
-- não quebra o runtime. NÃO reescrever generations/flows/saved_prompts (apontam por UUID).
