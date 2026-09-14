# LOCAL MIGRATIONS — PRE-RECONCILE ARCHIVE

**Data:** 2026-09-09 · **Fonte:** `supabase/migrations/` (cópia integral, evidência histórica).
**Nada deletado.** Classificação por §8 do FLUXYRA-MIGRATION-HISTORY-RECONCILE-01, cruzando
history remoto (`supabase_migrations.schema_migrations`, read-only) + schema atual de produção +
conteúdo SQL + efeitos já presentes em produção.

Categorias: **A** remote-history equivalent · **B** reference-only/non-executable ·
**C** current-schema baseline artifact (efeito já em produção) · **D** true pending · **E** obsolete/superseded.

| file | version | sha256 | class | evidência |
|---|---|---|---|---|
| 0001_init.sql | (sem timestamp) | 1463c579…751f38 | **B** | cabeçalho "⚠️ REFERÊNCIA… NÃO execute este script no banco hospedado" |
| 0002_rpc_credits.sql | (sem timestamp) | 197c3053…2a6c2f7c9 | **B** | par do 0001 (proposta v2 de RPC de créditos) |
| 20260726000000_production_baseline.sql | 20260726000000 | ada4afe4…dac4c5c | **C** | "PRODUÇÃO BASELINE — reconstruído… validar RLS antes de usar em ambiente novo" (snapshot do schema já existente) |
| 20260726193712_saved_prompts.sql | 20260726193712 | a650a231…cca4cfc | **C** | tabela `saved_prompts` já existe em produção |
| 20260726200000_seeds.sql | 20260726200000 | 8a24fca5…992e1de | **C** | tabela `seeds` + catálogo já em produção |
| 20260726210000_products_rls.sql | 20260726210000 | 3050b0a3…eb1b499 | **C** | tabela `products` + RLS já em produção |
| 20260726220000_ugc_projects.sql | 20260726220000 | e9c58c62…2efd5e1 | **C** | tabela `ugc_projects` já em produção |
| 20260726234400_influencers.sql | 20260726234400 | 6e14532e…aae7216 | **C** | tabela `influencers` já em produção |
| 20260727004500_influencer_content.sql | 20260727004500 | db8dad66…c300af | **C** | tabela `influencer_content` já em produção |
| 20260903110000_tts_catalog_consolidation.sql | 20260903110000 | 7541f6a3…080e50 | **D** | efeito ausente em produção (metadata TTS não consolidada) |
| 20260903120000_tts_per_kchar_billing.sql | 20260903120000 | 7422ebfa…dccb9d | **D** | coluna/metadata per-kchar ausente |
| 20260906130000_kling_sound_catalog.sql | 20260906130000 | 5e5ca4e6…67ed34 | **D** | `model_id='kling-sound'` ausente (0 linhas) |
| 20260906140000_mmaudio_catalog.sql | 20260906140000 | f94f0a3a…e91a396 | **D** | `model_id='mmaudio-video2audio'` ausente (prod tem só `mmaudio`) |
| 20260906150000_video_catalog_id_truth.sql | 20260906150000 | 64c97905…2713da | **D** | renames `seedance-2.0-mini`/`wan-2.6` ausentes (ids legados ainda presentes) |
| 20260906160000_billing_atomicity.sql | 20260906160000 | 6526d9d0…a74258 | **D** | `generations.external_id` ausente; RPCs claim/debit ausentes |
| 20260906170000_billing_product_truth.sql | 20260906170000 | 915cecf1…15fbb6 | **D** | parte do bloco de billing não aplicado (>20260822) |
| 20260907120000_free_image_trial.sql | 20260907120000 | e6d3f74d…f6e2be | **D** | tabela `free_image_trials` ausente |
| 20260907130000_competitor_video_coverage.sql | 20260907130000 | dd7e255b…d44171 | **D** | linhas `gemini-omni-flash`/`kling-3.0-4k` ausentes |
| 20260907140000_video_reliability.sql | 20260907140000 | 64fc5ab7…8ca36f | **D** | `generations.generation_intent_id` + `provider_webhook_events` ausentes |

**Resumo:** B=2 (reference) · C=7 (baseline artifacts, efeito já em produção) · **D=10 (TRUE PENDING)** · A/E=0.

**Remote history (12, read-only, esquema de versão distinto, último = 20260822034620):** `0001_init`,
`0002_harden_function_security`, `0003_add_model_variant`, `0004_add_assets`, `0005_add_products`,
`create_flows_table`, `stripe_events_idempotency`, `etapa_7_2_1_1_kling_motion_pro_pricing`,
`etapa_7_2_2_kling_metadata_cleanup`, `etapa_7_4_3_mini_duration_range`,
`etapa_7_4_4_seedance25_1080p_cps`, `etapa_7_5_1_hailuo_model_billing` — todos com SQL body disponível
em `schema_migrations.statements` (fetchável read-only). Nenhum coincide com os arquivos locais.
