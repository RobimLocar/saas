# RECONCILED EXECUTABLE MIGRATION DIRECTORY — MANIFEST

**Data:** 2026-09-09 · `supabase/migrations/` reconciliado (MIGRATION-REPO-RECONCILE-01).
**23 arquivos executáveis** = 12 remotos + 1 bridge + 10 pending. **0 arquivos B/C executáveis.**

## 12 remote migrations (versões exatas do history remoto; SQL byte-faithful dos statements)

| version | name | sha256 (arquivo repo) |
|---|---|---|
| 20260722023842 | 0001_init | 2c5931c6…2290b9 |
| 20260722023930 | 0002_harden_function_security | c0e6c165…239091 |
| 20260722180316 | 0003_add_model_variant | 07bae2cd…5d41fc |
| 20260722203159 | 0004_add_assets | 33e3ac3d…14972e |
| 20260722213854 | 0005_add_products | f02fd6a5…98a18 |
| 20260815193301 | create_flows_table | af17e563…65e6ef |
| 20260821182706 | stripe_events_idempotency | 98eb569e…0894f4 |
| 20260821221106 | etapa_7_2_1_1_kling_motion_pro_pricing | e6015d36…ab230a |
| 20260821223350 | etapa_7_2_2_kling_metadata_cleanup | adb790b0…006ff6 |
| 20260822021447 | etapa_7_4_3_mini_duration_range | cf64c9f8…0aec7a |
| 20260822023836 | etapa_7_4_4_seedance25_1080p_cps | 58a2c011…419639 |
| 20260822034620 | etapa_7_5_1_hailuo_model_billing | 0af8aded…aae93a |

> Nota: o matching de history é por **VERSION** (timestamp do filename), que é exato. O corpo SQL é
> fiel aos `schema_migrations.statements`; a fonte autoritativa dos corpos permanece o history remoto.

## 1 historical bridge

| version | file | sha256 | bytes | static rows |
|---|---|---|---|---|
| 20260821190000 | 20260821190000_historical_drift_capture.sql | **e455425e530bbd95342ec545a48daff048e588b6862eab4eec37339d41011b7e** | 41099 | 43 |

Contrato (CONTRACT-FIX-01): 14 FKs + 2 UNIQUEs + 8 INDEXes + 27 policies (bridge) + `sort_order` nas 43
linhas + FAIL-LOUD (schema require-cols por tabela + drift de contrato por linha). Parity semântica vs
produção: **FK 15/15 · UNIQUE 2/2 · INDEX 9/9 · POLICY 30/30 · MATERIAL SCHEMA DRIFT = 0**
(inclui os objetos de `products` do remote #5). SHA anterior `a5923167…` fica INVALIDADO.

## 10 true pending (byte-identical, inalterados)

`20260903110000_tts_catalog_consolidation`, `20260903120000_tts_per_kchar_billing`,
`20260906130000_kling_sound_catalog`, `20260906140000_mmaudio_catalog`,
`20260906150000_video_catalog_id_truth`, `20260906160000_billing_atomicity`,
`20260906170000_billing_product_truth`, `20260907120000_free_image_trial`,
`20260907130000_competitor_video_coverage`, `20260907140000_video_reliability`.

## 9 arquivos B/C — MOVIDOS para fora do dir executável (sem deleção)

Preservados byte-a-byte em `docs/db-history/local-migrations-pre-reconcile/` (SHA original) e os
markers movidos para `docs/db-history/superseded-from-executable/` (via `mv`, sem `rm`).

| arquivo | sha256 ORIGINAL (archive) | status |
|---|---|---|
| 0001_init.sql | 1463c579…751f38 | ARCHIVED (B) |
| 0002_rpc_credits.sql | 197c3053…2a6c2f7c9 | ARCHIVED (B) |
| 20260726000000_production_baseline.sql | ada4afe4…dac4c5c | ARCHIVED (C) |
| 20260726193712_saved_prompts.sql | a650a231…cca4cfc | ARCHIVED (C) |
| 20260726200000_seeds.sql | 8a24fca5…992e1de | ARCHIVED (C) |
| 20260726210000_products_rls.sql | 3050b0a3…eb1b499 | ARCHIVED (C) |
| 20260726220000_ugc_projects.sql | e9c58c62…2efd5e1 | ARCHIVED (C) |
| 20260726234400_influencers.sql | 6e14532e…aae7216 | ARCHIVED (C) |
| 20260727004500_influencer_content.sql | db8dad66…c300af | ARCHIVED (C) |

**ARCHIVE COPY SHA MATCH: PASS (9/9)** vs o MANIFEST original. Nenhum arquivo foi deletado.
Resíduo: subpasta vazia `supabase/migrations/_archived_bc/` (rmdir bloqueado pelo FUSE — inofensiva,
não é `.sql`; owner pode remover com `git`). Subpasta pré-existente `supabase/migrations/deprecated/`
não é tocada (não é migration top-level).
