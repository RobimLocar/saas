-- COMPETITOR-VIDEO-01/02 — Cobertura de Video vs concorrente (PREPARE-ONLY).
--
-- Lista FECHADA de 19 (Product Owner). Esta migration (unapplied → modificada in-place):
--   1) ADICIONA os FALTANTES com provider oficial (dormant: is_active=false);
--   2) CORRIGE display-truth de rows PARCIAIS ativos (áudio/resolução/nome);
--   3) ADICIONA metadata do seletor (family/badges/modes) + MAPA de modelo por MODO
--      (atlas_models_by_mode) para o spine P11a mode-aware.
-- NÃO faz DELETE. NÃO altera UUIDs/history. NÃO ativa os novos SKUs.
--
-- ⚠ DECISÕES PENDENTES antes de ATIVAR (por isso is_active=false):
--   (a) BILLING — cps abaixo são PROPOSTOS, não ratificados (provider $/s não confirmado).
--       LTX é preço por MEGAPIXEL×FRAMES → SEM cps (não inventar). Gemini Omni tem custo
--       DEPENDENTE DE MODO → billing precisa ser mode-aware antes de ativar.
--   (b) REAL-PROVIDER VERIFICATION — strings exatas de atlas_model por modo.
--
-- ⚠ APPLY GATE: chain NÃO aplicada. NÃO aplicar.

-- ── 1) FALTANTES/ADITIVOS — Atlas (dormant, spine P11a mode-aware) ────────────
-- ADDITIVE-ONLY: Atlas ADICIONA cobertura (modelos/variantes/modes que a PiAPI não
-- tem). NUNCA substitui um SKU PiAPI funcional. Variantes de mesma família (ex.: 4K)
-- entram como LINHA SEPARADA; a versão PiAPI permanece ativa/visível.
insert into public.ai_models (model_id, name, type, provider, is_active, credit_cost, min_plan, params)
values
  -- Grok Imagine Video v1.5 (uma SKU visível; modo troca o atlas_model confiável).
  ('grok-imagine-video', 'Grok', 'video', 'atlas', false, 60, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','xai/grok-imagine-video-v1.5/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','xai/grok-imagine-video-v1.5/text-to-video',
        'image-to-video','xai/grok-imagine-video-v1.5/image-to-video',
        'reference-to-video','xai/grok-imagine-video-v1.5/reference-to-video'),
     'family','Grok', 'family_description','Geração criativa de vídeo com IA',
     'resolution','1080p', 'dur_min',1, 'dur_max',15, 'duration_range','1s–15s', 'has_audio', true,
     'badges', jsonb_build_array('AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video','reference-to-video'),
     'credit_per_second', jsonb_build_object('480p',6,'720p',9,'1080p',12)  -- PROPOSTO (PO)
  )),
  -- MiniMax H3 (768P/2K, 4–15s, multimodal references).
  ('minimax-h3', 'MiniMax H3', 'video', 'atlas', false, 80, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','minimax/h3/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','minimax/h3/text-to-video',
        'image-to-video','minimax/h3/image-to-video',
        'reference-to-video','minimax/h3/reference-to-video'),
     'family','Hailuo', 'family_description','Vídeo multimodal MiniMax',
     'resolution','2K', 'dur_min',4, 'dur_max',15, 'duration_range','4s–15s', 'has_audio', true,
     'badges', jsonb_build_array('NEW','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video','reference-to-video'),
     'credit_per_second', jsonb_build_object('768p',10,'2k',18)  -- PROPOSTO (PO)
  )),
  -- Veo 3.1 Lite (720/1080; 1080 SÓ com 8s; dur 4/6/8; áudio nativo).
  ('veo-3.1-lite', 'Veo 3.1 Lite', 'video', 'atlas', false, 60, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','google/veo3.1-lite/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','google/veo3.1-lite/text-to-video',
        'image-to-video','google/veo3.1-lite/image-to-video',
        'start-end-frame','google/veo3.1-lite/start-end-frame-to-video'),
     'family','Veo', 'family_description','Geração premium com controle de áudio',
     'resolution','1080p', 'dur_min',4, 'dur_max',8, 'duration_range','4s–8s', 'has_audio', true,
     'resolution_duration_rule','1080p requires 8s',
     'badges', jsonb_build_array('NEW','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video','start-end-frame'),
     'credit_per_second', jsonb_build_object('720p',12,'1080p',12)  -- PROPOSTO (PO)
  )),
  -- Seedance 1.5 Pro — endpoint técnico 480/720 (DOC INCONSISTENCY vs marketing 1080).
  ('seedance-1.5-pro-atlas', 'Seedance 1.5 Pro', 'video', 'atlas', false, 80, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','bytedance/seedance-v1.5-pro/text-to-video',
     -- PRE-SMOKE-COVERAGE-01 §1 — Atlas expõe oficialmente t2v E i2v p/ Seedance 1.5 Pro.
     -- i2v: image obrigatória, last_image opcional (payload_field_map §4). Mesma família visual.
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','bytedance/seedance-v1.5-pro/text-to-video',
        'image-to-video','bytedance/seedance-v1.5-pro/image-to-video'),
     'family','Seedance', 'family_description','Vídeo cinematográfico com áudio nativo',
     'resolution','720p', 'resolutions', jsonb_build_array('480p','720p'),
     'dur_min',4, 'dur_max',12, 'duration_range','4s–12s', 'has_audio', true,
     'doc_inconsistency','SEEDANCE 1.5 PRO RESOLUTION — endpoint 480/720; marketing 1080. UI não promete 1080.',
     'badges', jsonb_build_array('AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video'),
     'credit_per_second', jsonb_build_object('480p',9,'720p',14)  -- PROPOSTO (PO); SEM 1080p
  )),
  -- Gemini Omni Flash — PRE-SMOKE-COVERAGE-01 §2/§3: slug OFICIAL ATUAL = gemini-omni-flash
  -- (NÃO gemini-omni-1.1-flash, obsoleto). STANDARD t2v/i2v 720p ativado (§3). Reference/
  -- Edit/Extend e Developer (1080/4K) ficam DORMANT com razões exatas (§4/§5/§6) e NÃO entram
  -- em atlas_models_by_mode/modes ativos (não vendáveis sem billing provado).
  ('gemini-omni-flash', 'Gemini Omni Flash', 'video', 'atlas', false, 40, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','google/gemini-omni-flash/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','google/gemini-omni-flash/text-to-video',
        'image-to-video','google/gemini-omni-flash/image-to-video'),
     -- GEMINI-STANDARD-CONTRACT-FIX-01 §1 — Standard I2V: body final usa `image` (NÃO image_url;
     -- sem end frame no Standard). Developer usa images[] (contrato diferente; dormant).
     'payload_field_map', jsonb_build_object('image_url','image'),
     'family','Gemini Omni Flash', 'family_description','Geração multimodal de vídeo',
     'resolution','720p', 'resolutions', jsonb_build_array('720p'),
     'dur_min',3, 'dur_max',10, 'duration_range','3s–10s', 'has_audio', true,
     'badges', jsonb_build_array('NEW','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video'),
     'dormant_modes', jsonb_build_object(
        'developer','DOC CONFLICT — DEVELOPER BILLING CONTRACT: endpoints *-developer expõem 1080/4K + 4/6/8/10s, mas o material público apresenta base+per-second, sem amarrar inequivocamente os tiers 0.11/0.16/0.31 ao endpoint Developer. Dormant até /calculate.',
        'reference-to-video','DORMANT — COMPOSITE BILLING QUOTE REQUIRED: pricing de referência é composto; não cobrar a 13 cps cegamente.',
        'video-edit','DORMANT — QUOTE REQUIRED: preço calculado a partir dos inputs do request.'),
     'credit_per_second', jsonb_build_object('720p',13)  -- STANDARD 720p oficial $0.11/s → 13 cps
  )),
  -- LTX — preço por MP×frames → SEM cps (dormant até decisão do PO).
  ('ltx-2', 'LTX', 'video', 'atlas', false, 24, 'starter', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','ltx-2.3-quality/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','ltx-2.3-quality/text-to-video',
        'image-to-video','ltx-2.3-quality/image-to-video',
        'video-extend','ltx-2.3-quality/extend-video'),
     'family','LTX', 'family_description','Vídeo ultrarrápido e acessível',
     'resolution','1080p', 'dur_min',4, 'dur_max',10, 'duration_range','4s–10s', 'has_audio', true,
     'billing_note','LTX cobra por megapixels×frames (width×height×num_frames) — NÃO usar cps. PO deve definir fórmula raw-credit antes de ativar.',
     'badges', jsonb_build_array('FAST','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video','video-extend')
     -- SEM credit_per_second: billing não pode ser fingido.
  )),
  -- Kling 3.0 Turbo — Atlas (áudio). SEM MULTI (sem prova oficial de multi-shot no Turbo).
  ('kling-3.0-turbo', 'Kling 3.0 Turbo', 'video', 'atlas', false, 55, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','kwaivgi/kling-v3.0-turbo/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','kwaivgi/kling-v3.0-turbo/text-to-video',
        'image-to-video','kwaivgi/kling-v3.0-turbo/image-to-video'),
     'family','Kling', 'family_description','Controle avançado de movimento e referências',
     'resolution','1080p', 'dur_min',3, 'dur_max',15, 'duration_range','3s–15s', 'has_audio', true,
     'badges', jsonb_build_array('TURBO','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video'),
     'credit_per_second', jsonb_build_object('720p',10.4,'1080p',15.2)  -- PROPOSTO (PO)
  )),
  -- Kling 3.0 4K — Atlas ADITIVO (variante 4K + AUDIO + MULTI). NÃO substitui o PiAPI
  -- kling-3.0 (1080p): é uma LINHA SEPARADA no catálogo. O PiAPI permanece ativo/visível.
  ('kling-3.0-4k', 'Kling 3.0 4K', 'video', 'atlas', false, 90, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     'atlas_model','kwaivgi/kling-v3.0-4k/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','kwaivgi/kling-v3.0-4k/text-to-video',
        'image-to-video','kwaivgi/kling-v3.0-4k/image-to-video'),
     -- §2 — I2V envia `image`/`end_image` no body final (payload_field_map), NÃO image_url.
     'payload_field_map', jsonb_build_object('image_url','image','end_image_url','end_image'),
     'family','Kling', 'family_description','Controle avançado de movimento e referências',
     'resolution','4K', 'dur_min',3, 'dur_max',15, 'duration_range','3s–15s', 'has_audio', true,
     'multi_shot', true, 'additive_variant_of','kling-3.0',
     'badges', jsonb_build_array('4K','MULTI','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video','multi-shot'),
     'credit_per_second', jsonb_build_object('1080p',16,'4k',28)  -- PROPOSTO (PO)
  )),
  -- Kling Omni 4K — Atlas ADITIVO (variante 4K + AUDIO + MULTI). NÃO substitui o PiAPI
  -- kling-omni: linha separada. O PiAPI permanece ativo/visível.
  ('kling-omni-4k', 'Kling Omni 4K', 'video', 'atlas', false, 100, 'pro', jsonb_build_object(
     'runtime_provider','atlas', 'atlas_contract','video-basic',
     -- CONNECTION-FINAL-FIX-01 §1/§15 — O3 4K expõe SOMENTE text-to-video e image-to-video
     -- no OpenAPI index Atlas atual. reference-to-video NÃO existe para kling-video-o3-4k
     -- (só para o3-std/o3-pro, que são contratos/produtos DIFERENTES — não impersonar).
     -- Subjects/References do O3 4K entram via `elements` DENTRO de t2v/i2v.
     -- §2 — I2V envia `image`/`end_image` no body final (payload_field_map), NÃO image_url.
     'atlas_model','kwaivgi/kling-video-o3-4k/text-to-video',
     'atlas_models_by_mode', jsonb_build_object(
        'text-to-video','kwaivgi/kling-video-o3-4k/text-to-video',
        'image-to-video','kwaivgi/kling-video-o3-4k/image-to-video'),
     'payload_field_map', jsonb_build_object('image_url','image','end_image_url','end_image'),
     'family','Kling', 'family_description','Controle avançado de movimento e referências',
     'resolution','4K', 'dur_min',3, 'dur_max',15, 'duration_range','3s–15s', 'has_audio', true,
     'multi_shot', true, 'additive_variant_of','kling-omni',
     'badges', jsonb_build_array('4K','MULTI','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video','multi-shot'),
     'credit_per_second', jsonb_build_object('1080p',16,'4k',28)  -- PROPOSTO (PO)
  ))
on conflict do nothing;

-- ── 2) DISPLAY TRUTH — corrigir metadata de PARCIAIS ativos (catálogo = provider) ─
-- Kling 3.0 (PiAPI): áudio nativo real (PiAPI Kling 3.0 = "with Native Audio"); MULTI.
-- 4K NÃO no PiAPI → rótulo permanece 1080p (o SKU Atlas kling-3.0-4k traz 4K quando ativado).
update public.ai_models
  set params = params
    || jsonb_build_object('badges', jsonb_build_array('MULTI','AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','multi-shot','frames'))
  where model_id = 'kling-3.0' and is_active = true;

-- Kling Omni (PiAPI): o adapter NÃO envia enable_audio (gated no pool público) →
-- has_audio DEVE ser false (catálogo concorda com o runtime). Áudio+4K vêm do SKU Atlas.
update public.ai_models
  set params = params
    || jsonb_build_object('has_audio', false)
    || jsonb_build_object('badges', jsonb_build_array('MULTI'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','omni','multi-shot'))
  where model_id = 'kling-omni' and is_active = true;

-- Kling 2.5 Turbo (PiAPI kling-turbo): sem áudio nativo enviado → has_audio false.
update public.ai_models
  set params = params
    || jsonb_build_object('has_audio', false)
    || jsonb_build_object('badges', jsonb_build_array('TURBO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video'))
  where model_id = 'kling-2.5-turbo' and is_active = true;

-- Kling 3.0 Motion Control: modo motion-control.
update public.ai_models
  set params = params || jsonb_build_object('modes', jsonb_build_array('motion-control'))
  where model_id = 'kling-3.0-motion' and is_active = true;

-- Seedance 2.5 / 2.0 / Fast / 2.0 Mini: áudio + badges + modos.
update public.ai_models set params = params
    || jsonb_build_object('resolution', '1080p')
    || jsonb_build_object('badges', jsonb_build_array('AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','start-end-frame'))
  where model_id = 'seedance-2.5' and is_active = true;
update public.ai_models set params = params
    || jsonb_build_object('badges', jsonb_build_array('AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','start-end-frame'))
  where model_id = 'seedance-2.0' and is_active = true;
update public.ai_models set params = params
    || jsonb_build_object('badges', jsonb_build_array('FAST','AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','start-end-frame'))
  where model_id = 'seedance-2.0-fast' and is_active = true;
update public.ai_models set params = params
    || jsonb_build_object('badges', jsonb_build_array('FAST','AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video'))
  where model_id = 'seedance-1.5-pro' and name = 'Seedance 2.0 Mini' and is_active = true;

-- Veo 3.1 Quality/Fast: áudio + badges.
update public.ai_models set params = params
    || jsonb_build_object('badges', jsonb_build_array('AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','frames'))
  where model_id = 'veo-3.1-quality' and is_active = true;
update public.ai_models set params = params
    || jsonb_build_object('badges', jsonb_build_array('FAST','AUDIO'))
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','frames'))
  where model_id = 'veo-3.1-fast' and is_active = true;

-- Hailuo → "Hailuo 2.3 Pro" + expõe 1080p (ccmap tem 1080).
update public.ai_models
  set name = 'Hailuo 2.3 Pro',
      params = params
        || jsonb_build_object('resolution', '1080p')
        || jsonb_build_object('badges', jsonb_build_array('NEW'))
        || jsonb_build_object('modes', jsonb_build_array('text-to-video'))
  where model_id = 'hailuo' and is_active = true;

-- ── 3) ATIVAÇÃO ADITIVA — Atlas com CONTRATO + PREÇO OFICIAL (ADDITIVE-ACTIVATION-01) ─
-- REGRA COMERCIAL (§5.1): cps DERIVADO do preço público oficial Atlas (USD/s) pela
-- regra de margem já aprovada — pior caso Agency = $0.0149/cr × (1-MIN_MARGIN 0.4) =
-- $0.00894 de custo por crédito ⇒ cps = ceil(rate_usd / 0.00894). Todos ≥40% margem
-- no pior caso. §16: quando a coleção diverge do preço citado (mesma unidade), usa-se
-- o MAIOR valor oficial (billing conservador) e documenta-se DOC CONFLICT.
-- Provider = implementação interna; PiAPI existente permanece FROZEN e VISÍVEL.
-- APPLY GATE segue FECHADO (is_active=true aqui = PROJECTED ACTIVE; migration unapplied).
--
-- Seedance 1.5 Pro — Atlas $0.052/s (oficial) → cps 6 (480/720). Sem 1080 (endpoint não expõe).
update public.ai_models set is_active = true,
  params = params
    || jsonb_build_object('credit_per_second', jsonb_build_object('480p',6,'720p',6))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.052,'price_source','Atlas official list $0.052/s')
  where model_id = 'seedance-1.5-pro-atlas';
-- Veo 3.1 Lite — Atlas starting $0.05/s → cps 6 (720/1080). 1080p SÓ 8s; sem 4K.
update public.ai_models set is_active = true,
  params = params
    || jsonb_build_object('credit_per_second', jsonb_build_object('720p',6,'1080p',6))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.05,'price_source','Atlas official list starting $0.05/s')
  where model_id = 'veo-3.1-lite';
-- MiniMax H3 — PO oficial 768P $0.10/s → cps 12; 2K $0.14/s → cps 16.
-- DOC CONFLICT: a coleção mostra "From $0.038/SEC" (starting/menor-res); §16 → usa-se o MAIOR (PO).
update public.ai_models set is_active = true,
  params = params
    || jsonb_build_object('credit_per_second', jsonb_build_object('768p',12,'2k',16))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec', jsonb_build_object('768p',0.10,'2k',0.14),'price_source','Atlas official 768P $0.10/s · 2K $0.14/s (DOC CONFLICT vs collection From $0.038/s → higher used, §16)')
  where model_id = 'minimax-h3';
-- Grok Imagine Video v1.5 — Atlas $0.08/s → cps 9 (480/720/1080). Ref 480/720, ≤7 refs.
-- Audio nativo NÃO badgeado (só quando technical endpoint provar).
update public.ai_models set is_active = true,
  params = params
    || jsonb_build_object('credit_per_second', jsonb_build_object('480p',9,'720p',9,'1080p',9))
    || jsonb_build_object('max_reference_images', 7)  -- Grok reference: 1–7 image_urls
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.08,'price_source','Atlas official list $0.08/s')
  where model_id = 'grok-imagine-video';
-- Kling 3.0 Turbo (Atlas ADITIVO) — $0.112/s → cps 13 (720/1080). Sem AUDIO/MULTI badge (não provado).
update public.ai_models set is_active = true,
  params = params
    || jsonb_build_object('credit_per_second', jsonb_build_object('720p',13,'1080p',13))
    || jsonb_build_object('badges', jsonb_build_array('TURBO'), 'modes', jsonb_build_array('text-to-video','image-to-video'))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.112,'price_source','Atlas official list $0.112/s')
  where model_id = 'kling-3.0-turbo';
-- Kling 3.0 4K / O3 4K (Atlas ADITIVO) — ATIVADOS (VIDEO-PRODUCT-FINAL-01) com controles
-- técnicos oficiais wired: duration 3–15, sound, cfg_scale (0–1), negative_prompt,
-- multi_shot (customize/intelligence, multi_prompt soma==total, ≤6), e (O3) elements.
-- BILLING (§11): docs oficiais Atlas = per-second Rate(res)×Duration; sound/multi_shot
-- NÃO são surcharge (multi-shot gera 1 vídeo de duração total ⇒ custo = cps×duração).
-- cps 47 ($0.42/s) preservado. PiAPI Kling 3.0/Omni seguem ATIVOS (aditivo, sem replace).
update public.ai_models set is_active = true,
  params = (params - 'dormant_reason')
    || jsonb_build_object('credit_per_second', jsonb_build_object('1080p',47,'4k',47))
    || jsonb_build_object('badges', jsonb_build_array('4K','MULTI'), 'audio_mode','none')
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','image-to-video','multi-shot'))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.42)
    || jsonb_build_object('dur_min',3,'dur_max',15)
    || jsonb_build_object('payload_field_map', jsonb_build_object('image_url','image','end_image_url','end_image'))
    -- §8 — `elements` NÃO entra em supported_params (billing surcharge de referências NÃO
    -- provado; /calculate egress-blocked). capabilities_by_mode expõe a capacidade para a UI
    -- (editor de Subjects renderiza, mas TRAVADO: elements_billing_verified=false ⇒ não serializa).
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('sound','cfg_scale','negative_prompt','multi_shot'),
         'image-to-video', jsonb_build_array('sound','cfg_scale','negative_prompt','multi_shot')))
    || jsonb_build_object('capabilities_by_mode', jsonb_build_object(
         'image-to-video', jsonb_build_object('elements', true)))
    || jsonb_build_object('elements_billing_verified', false, 'max_reference_images', 4,
         'elements_status','DORMANT — QUOTE REQUIRED: surcharge de referências (elements) não provado; /calculate inacessível no sandbox. UI de Subjects renderiza travada até o quote confirmar paridade de cps.')
  where model_id = 'kling-3.0-4k';
update public.ai_models set is_active = true,
  params = (params - 'dormant_reason')
    || jsonb_build_object('credit_per_second', jsonb_build_object('1080p',47,'4k',47))
    || jsonb_build_object('badges', jsonb_build_array('4K','MULTI'), 'audio_mode','none')
    || jsonb_build_object('modes', jsonb_build_array('text-to-video','image-to-video','multi-shot'))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.42)
    || jsonb_build_object('dur_min',3,'dur_max',15,'max_reference_images',4)
    || jsonb_build_object('payload_field_map', jsonb_build_object('image_url','image','end_image_url','end_image'))
    -- §8 — idem: elements DORMANT (quote required). Fora de supported_params ⇒ nunca despachado.
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('sound','multi_shot'),
         'image-to-video', jsonb_build_array('sound','multi_shot')))
    || jsonb_build_object('capabilities_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_object('elements', true),
         'image-to-video', jsonb_build_object('elements', true)))
    || jsonb_build_object('elements_billing_verified', false,
         'elements_status','DORMANT — QUOTE REQUIRED: surcharge de referências (elements) não provado; /calculate inacessível no sandbox. UI de Subjects renderiza travada até o quote confirmar paridade de cps.')
  where model_id = 'kling-omni-4k';

-- ── 3b) PROPRIEDADES POR MODE (MODEL-PROPERTIES) — fonte de verdade p/ UI + server ─
-- Cada IA ativa carrega SOMENTE propriedades que o endpoint técnico oficial suporta
-- (resolutions/aspect/duration/audio/references). O resolver resolveVideoCapabilities
-- lê estes campos; a UI e o isValidCombo consomem a MESMA verdade. Provider = interno.
-- Grok v1.5 (ROUTE-CERTIFICATION-01, official technical contract) — t2v/i2v 480/720/1080;
-- reference 480/720 (≤7 imgs, campo image_urls, voice_ids opcional). 1–15s. NATIVE
-- SYNCHRONIZED AUDIO = YES → audio_mode 'always'. Aspects: 1:1/16:9/9:16/4:3/3:4/3:2/2:3.
update public.ai_models set params = params
    || jsonb_build_object('resolution_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('480p','720p','1080p'),
         'image-to-video', jsonb_build_array('480p','720p','1080p'),
         'reference-to-video', jsonb_build_array('480p','720p')))
    || jsonb_build_object('aspect_ratios', jsonb_build_array('1:1','16:9','9:16','4:3','3:4','3:2','2:3'))
    || jsonb_build_object('dur_min',1,'dur_max',15,'audio_mode','always')
  where model_id = 'grok-imagine-video';
-- MiniMax H3 (official) — 768P/2K, 4–15s (NÃO 5–15). Aspect t2v: 21:9/16:9/4:3/1:1/3:4/9:16;
-- i2v: adaptive (capabilities_by_mode). Reference = mixed (image/video/audio via refers[],
-- ≥1 imagem ou vídeo). audio nativo (always). prompt_expansion suportado (opcional).
update public.ai_models set params = params
    || jsonb_build_object('resolutions', jsonb_build_array('768p','2k'))
    || jsonb_build_object('aspect_ratios', jsonb_build_array('21:9','16:9','4:3','1:1','3:4','9:16'))
    || jsonb_build_object('capabilities_by_mode', jsonb_build_object(
         'image-to-video', jsonb_build_object('aspectRatios', jsonb_build_array('adaptive','21:9','16:9','4:3','1:1','3:4','9:16'))))
    || jsonb_build_object('dur_min',4,'dur_max',15,'audio_mode','always')
    -- §17 — reference MIXTA: image/video/audio, exige ≥1 imagem OU vídeo (audio-only → 400).
    || jsonb_build_object('reference_media', jsonb_build_array('image','video','audio'),
       'reference_requires_visual', true, 'max_reference_images', 4)
  where model_id = 'minimax-h3';
-- Veo 3.1 Lite (official) — 720p (4/6/8) e 1080p (SÓ 8s); start-end exige image+last_image.
-- Aspect 16:9/9:16. Audio: sem toggle documentado no schema → audio_mode 'always' (indicador,
-- não toggle falso). Seed suportado (opcional, ver justificativa no certificado).
update public.ai_models set params = params
    || jsonb_build_object('resolution_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('720p','1080p'),
         'image-to-video', jsonb_build_array('720p','1080p'),
         'start-end-frame', jsonb_build_array('720p','1080p')))
    || jsonb_build_object('duration_options', jsonb_build_array(4,6,8))
    || jsonb_build_object('duration_by_resolution', jsonb_build_object('1080p', jsonb_build_array(8)))
    || jsonb_build_object('aspect_ratios', jsonb_build_array('16:9','9:16'),'audio_mode','always')
  where model_id = 'veo-3.1-lite';
-- Seedance 1.5 Pro (official) — 480/720, 4–12s. generate_audio = TOGGLE (param booleano).
-- Aspect 21:9/16:9/4:3/1:1/3:4/9:16. camera_fixed/seed/last_image opcionais (certificado).
update public.ai_models set params = params
    || jsonb_build_object('resolutions', jsonb_build_array('480p','720p'))
    || jsonb_build_object('aspect_ratios', jsonb_build_array('21:9','16:9','4:3','1:1','3:4','9:16'))
    || jsonb_build_object('dur_min',4,'dur_max',12,'audio_mode','toggle')
  where model_id = 'seedance-1.5-pro-atlas';
-- Kling 3.0 Turbo (official) — I2V prova duration 3–15 (imagem obrigatória). Duração NÃO
-- é global 5/10; usa range por modo (capabilities_by_mode). 720/1080. Sem audio (não provado).
update public.ai_models set params = params
    || jsonb_build_object('resolutions', jsonb_build_array('720p','1080p'))
    || jsonb_build_object('capabilities_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_object('duration', jsonb_build_object('kind','range','min',3,'max',15)),
         'image-to-video', jsonb_build_object('duration', jsonb_build_object('kind','range','min',3,'max',15))))
    || jsonb_build_object('dur_min',3,'dur_max',15)
    || jsonb_build_object('aspect_ratios', jsonb_build_array('16:9','9:16','1:1'),'audio_mode','none')
  where model_id = 'kling-3.0-turbo';
-- Kling 3.0 4K — 1080/4K, duração RANGE 3–15 (sem enum 5/10). Aspect 16:9/9:16/1:1.
-- audio_mode='none' (o parâmetro é `sound` no painel avançado). Multi-shot via editor.
update public.ai_models set params = params
    || jsonb_build_object('resolutions', jsonb_build_array('1080p','4k'))
    || jsonb_build_object('aspect_ratios', jsonb_build_array('16:9','9:16','1:1'),'audio_mode','none')
  where model_id = 'kling-3.0-4k';
-- Kling Omni/O3 4K — 1080/4K, duração RANGE 3–15. Aspect 16:9/9:16/1:1. `sound` no
-- painel avançado; multi-shot via editor; subjects/elements via UI dedicada.
update public.ai_models set params = params
    || jsonb_build_object('resolution_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('1080p','4k'),
         'image-to-video', jsonb_build_array('1080p','4k')))
    || jsonb_build_object('aspect_ratios', jsonb_build_array('16:9','9:16','1:1'),'audio_mode','none')
  where model_id = 'kling-omni-4k';

-- ── 3c) ADVANCED PARAMS POR MODE (ROUTE-CERTIFICATION-01) ─────────────────────
-- Declara os campos AVANÇADOS que cada model/mode oficialmente suporta. A rota só
-- inclui no payload os declarados aqui (server-trusted); o profile valida o tipo.
-- Grok reference: voice_ids (≤3). H3: prompt_expansion. Veo Lite: seed. Seedance 1.5:
-- generate_audio (toggle) + camera_fixed + seed. Kling Turbo: nenhum confirmado.
update public.ai_models set params = params
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'reference-to-video', jsonb_build_array('voice_ids')))
  where model_id = 'grok-imagine-video';
update public.ai_models set params = params
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('prompt_expansion'),
         'image-to-video', jsonb_build_array('prompt_expansion')))
  where model_id = 'minimax-h3';
update public.ai_models set params = params
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('seed'),
         'image-to-video', jsonb_build_array('seed'),
         'start-end-frame', jsonb_build_array('seed')))
  where model_id = 'veo-3.1-lite';
update public.ai_models set params = params
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('generate_audio','camera_fixed','seed'),
         'image-to-video', jsonb_build_array('generate_audio','camera_fixed','seed')))
  where model_id = 'seedance-1.5-pro-atlas';

-- ── 4) EXACT PAYLOAD FIELD MAPS (COMPETITOR-VIDEO-04) ─────────────────────────
-- O profile monta o body CANÔNICO (image_url/end_image_url/refers); estes mapas
-- renomeiam/reformatam para o contrato EXATO do provider (dispatch.applyAtlasFieldMap).
-- Veo Lite / Seedance 1.5: image_url→image, end_image_url→last_image.
update public.ai_models set params = params
    || jsonb_build_object('payload_field_map', jsonb_build_object('image_url','image','end_image_url','last_image'))
  where model_id in ('veo-3.1-lite','seedance-1.5-pro-atlas');
-- MiniMax H3 reference: refers:[{url}]; i2v usa image + end_image (não last_image).
update public.ai_models set params = params
    || jsonb_build_object('refers_as_objects', true)
    || jsonb_build_object('payload_field_map', jsonb_build_object('image_url','image','end_image_url','end_image'))
  where model_id = 'minimax-h3';
-- Grok reference: image_urls[] (NÃO refers) + resolução POR MODO (reference = 480/720 only).
update public.ai_models set params = params
    || jsonb_build_object('refers_field','image_urls')
    || jsonb_build_object('resolution_by_mode', jsonb_build_object('reference-to-video', jsonb_build_array('480p','720p')))
  where model_id = 'grok-imagine-video';

-- ── 5) Veo 3.1 Quality/Fast 4K — Atlas ADITIVO (variante 4K), DORMANT (pricing 4K) ─
-- Linhas SEPARADAS: o SKU PiAPI 1080p permanece ATIVO e VISÍVEL. Estas variantes 4K
-- NÃO substituem nada; entram dormant (SEM cps) até /calculate + PO. Additive-only.
insert into public.ai_models (model_id, name, type, provider, is_active, credit_cost, min_plan, params)
values
  ('veo-3.1-quality-4k', 'Veo 3.1 Quality 4K', 'video', 'atlas', false, 120, 'pro', jsonb_build_object(
     'runtime_provider','atlas','atlas_contract','video-basic','atlas_model','google/veo3.1/text-to-video',
     'atlas_models_by_mode', jsonb_build_object('text-to-video','google/veo3.1/text-to-video','image-to-video','google/veo3.1/image-to-video'),
     'payload_field_map', jsonb_build_object('image_url','image'),
     'family','Veo','family_description','Geração premium com controle de áudio',
     'resolution','4K','dur_min',4,'dur_max',8,'duration_range','4s–8s','has_audio',true,
     'resolution_duration_rule','1080p requires 8s', 'additive_variant_of','veo-3.1-quality',
     'badges', jsonb_build_array('4K','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video'),
     'billing_note','4K pricing pendente (/calculate) — SEM cps; dormant.'
  )),
  ('veo-3.1-fast-4k', 'Veo 3.1 Fast 4K', 'video', 'atlas', false, 80, 'pro', jsonb_build_object(
     'runtime_provider','atlas','atlas_contract','video-basic','atlas_model','google/veo3.1-fast/text-to-video',
     'atlas_models_by_mode', jsonb_build_object('text-to-video','google/veo3.1-fast/text-to-video','image-to-video','google/veo3.1-fast/image-to-video'),
     'payload_field_map', jsonb_build_object('image_url','image'),
     'family','Veo','family_description','Geração premium com controle de áudio',
     'resolution','4K','dur_min',4,'dur_max',8,'duration_range','4s–8s','has_audio',true,
     'resolution_duration_rule','1080p requires 8s', 'additive_variant_of','veo-3.1-fast',
     'badges', jsonb_build_array('4K','FAST','AUDIO'), 'modes', jsonb_build_array('text-to-video','image-to-video'),
     'billing_note','4K pricing pendente (/calculate) — SEM cps; dormant.'
  ))
on conflict do nothing;

-- ── 6) Seedance 2.0 4K — PARCIAL (4K existe na família Atlas; pricing não inequívoco) ─
update public.ai_models set params = params
    || jsonb_build_object('benchmark_4k','PARTIAL — família Atlas Seedance 2.0 tem 4K, mas pricing 4K não inequívoco. Não ativado (mantém 1080p PiAPI).')
  where model_id = 'seedance-2.0' and is_active = true;

-- ADDITIVE-ONLY (PROVIDER STRATEGY CORRECTION): o Atlas é provider de COBERTURA
-- ADITIVA, nunca de replacement. As variantes 4K (kling-3.0-4k / kling-omni-4k) são
-- LINHAS SEPARADAS. Os SKUs PiAPI kling-3.0 / kling-omni (1080p, provados) permanecem
-- ATIVOS e VISÍVEIS de forma PERMANENTE — NÃO serão ocultados nem inativados quando
-- o Atlas 4K for ativado (o usuário verá "Kling 3.0" e "Kling 3.0 4K" como produtos
-- distintos; provider é implementação interna). Sem hidden_from_selector por replacement.
update public.ai_models
  set is_active = true,
      params = params - 'hidden_from_selector'
  where model_id in ('kling-3.0', 'kling-omni');

-- ── 7) GEMINI OMNI FLASH — STANDARD t2v/i2v 720p ATIVADO (PRE-SMOKE-COVERAGE-01 §2/§3) ─
-- O bloqueador antigo ("EXACT TECHNICAL MODEL ID NOT PROVEN") está OBSOLETO: o index atual
-- prova google/gemini-omni-flash/{text-to-video,image-to-video}. Contrato STANDARD: 720p,
-- dur 3–10, aspect 16:9/9:16, seed, thinking_level. Preço público 720p = $0.11/s → 13 cps.
-- Developer (1080/4K) e Reference/Edit ficam DORMANT (dormant_modes, §4/§5/§6).
update public.ai_models set is_active = true,
  params = (params - 'dormant_reason')
    || jsonb_build_object('credit_per_second', jsonb_build_object('720p',13))
    || jsonb_build_object('atlas_billing_unit','per_second','price_basis_usd_per_sec',0.11,
         'price_source','Atlas official list 720p $0.11/s (Gemini Omni Flash standard)')
    || jsonb_build_object('aspect_ratios', jsonb_build_array('16:9','9:16'))
    || jsonb_build_object('supported_params_by_mode', jsonb_build_object(
         'text-to-video', jsonb_build_array('seed','thinking_level'),
         'image-to-video', jsonb_build_array('seed','thinking_level')))
  where model_id = 'gemini-omni-flash';

-- ── 8) LTX (COMPETITOR-VIDEO-05) — permanece DORMANT; DOC CONFLICT de UNIDADE ────
update public.ai_models set params = params
    || jsonb_build_object('billing_note',
         'DOC CONFLICT — BILLING UNIT: family page ~$0.002/s vs model page $0.0024075 por MEGAPIXEL gerado (width×height×num_frames). SEM cps. Dormant até decisão do PO.')
  where model_id = 'ltx-2';

-- FLUX 3 VIDEO: modelo oficial existe (Black Forest Labs) mas NÃO disponível via
-- PiAPI/Atlas atuais → SEM row (nem ativa nem dormante). Classificação de benchmark:
-- WAITING FOR PIAPI/ATLAS PROVIDER SUPPORT. Nada a inserir (não inventar replacement).

-- ── 9) DORMANT RESTANTE — UMA razão concreta cada (ADDITIVE-ACTIVATION-01) ──────
-- Os 7 alvos com contrato + preço público oficial foram ATIVADOS no §3. Permanecem
-- DORMANT apenas os que têm um bloqueador MATERIAL específico:
--  • Veo 3.1 Quality/Fast 4K: unidade per-second OK, mas SEM rate 4K oficial inequívoco
--    (a coleção mostra até 1080p; o endpoint técnico expõe 4K — DOC CONFLICT). O PiAPI
--    Veo 1080p permanece ATIVO; ativar a variante 4K só com preço 4K oficial provado.
update public.ai_models
  set params = params || jsonb_build_object(
    'atlas_billing_unit', 'per_second',
    'dormant_reason',
      'DORMANT — 4K BILLING RATE NOT PROVEN: contrato/unidade per-second OK (technical API expõe 4K), mas sem rate 4K oficial inequívoco (coleção mostra até 1080p — DOC CONFLICT). PiAPI Veo 1080p permanece ativo. Ativar com preço 4K oficial.')
  where model_id in ('veo-3.1-quality-4k','veo-3.1-fast-4k');
--  • Gemini Omni Flash: STANDARD t2v/i2v 720p AGORA ATIVO (§7, slug gemini-omni-flash
--    provado). Developer (1080/4K, DOC CONFLICT), Reference (composite) e Edit (quote)
--    ficam DORMANT via `dormant_modes` no row (não entram em modes/atlas_models_by_mode).
--    Nenhum update de dormancy global aqui (o produto standard é vendável).
-- LTX: DOC CONFLICT de UNIDADE (megapixel-based, não per-second) → incompatível com cps.
update public.ai_models
  set params = params || jsonb_build_object(
    'atlas_billing_unit', 'megapixels',
    'dormant_reason',
      'DORMANT — BILLING UNIT REQUIRES QUOTE: unidade oficial megapixel/frame (width×height×num_frames), INCOMPATÍVEL com cps. Usar o caminho atlas_quote (/calculate) para pré-débito seguro; ativar quando o quote estiver disponível.')
  where model_id = 'ltx-2';

-- ── ROLLBACK CONCEITUAL (NÃO executar) ───────────────────────────────────────
--   delete from public.ai_models where model_id in
--     ('grok-imagine-video','minimax-h3','veo-3.1-lite','seedance-1.5-pro-atlas',
--      'gemini-omni-flash','ltx-2','kling-3.0-turbo','kling-3.0-4k','kling-omni-4k');
--   (reverter params dos updates de display-truth ao estado anterior)
