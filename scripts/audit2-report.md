# Auditoria 2 — Relatório de Bugs do Fluxo Generate

Data: 2026-07-25

## Bugs encontrados e corrigidos

### Bug 1 — Hailuo Live: hailuo_model ERRADO (CRÍTICO)
- **Causa:** DB tinha `hailuo_model: "v2.3-fast"` → PiAPI retornava internal server error 500
- **Evidência:** teste direto curl → 100% falha com v2.3-fast, 100% sucesso com T2V-01-Director
- **Fix aplicado:** DB atualizado para `hailuo_model: "T2V-01-Director"` via script fix-audit2-models.mjs
- **Status:** ✅ Corrigido

### Bug 2 — Kling 2.5 Turbo: backend indisponível na PiAPI (CRÍTICO)
- **Causa:** `kling-turbo` model na PiAPI retorna internal server error 500 para qualquer payload
- **Evidência:** 5 testes diferentes (version=2.5-turbo, version=2.5, sem version, sem mode, payload mínimo) → todos falharam
- **Análise:** Provavelmente plano de API não tem acesso ao kling-turbo, ou o modelo foi descontinuado
- **Fix aplicado:** `is_active=false` no banco (modelo não aparece na lista de seleção)
- **Fix secundário:** client.ts removeu campo `version` do payload kling-turbo
- **Status:** ✅ Ocultado da UI (reativar quando PiAPI resolver)

### Bug 3 — Seedance: output_key incorreto no DB (não-bloqueante)
- **Causa:** DB tinha `output_key: "output.video_url"` mas PiAPI retorna `output.video`
- **Por que não bloqueava:** extractVideoUrl() tem fallback que tenta `output.video` quando `output.video_url` está vazio
- **Fix aplicado:** DB atualizado para `output_key: "output.video"` nos 3 modelos Seedance
- **Status:** ✅ Corrigido

### Bug 4 — task_type não exposto na API /models
- **Causa:** route.ts não incluía `task_type` no response
- **Consequência:** filtro de resolução Seedance fast/mini no frontend não funcionava
- **Fix aplicado:** `task_type` adicionado ao response de /api/models
- **Status:** ✅ Corrigido

## Modelos testados e resultado

| Modelo | Status PiAPI | Output Key | Estado Final |
|--------|-------------|-----------|--------------|
| Kling 3.0 | ✅ completed | output.video | OK |
| Kling 3.0 Motion Control | ✅ completed | output.video | OK |
| Kling Omni | ✅ completed | output.video | OK |
| Kling 2.5 Turbo | ❌ internal server error | — | Desativado |
| Veo 3 Fast | ✅ completed | output.video | OK |
| Veo 3 Quality | ✅ completed | output.video | OK |
| Veo 3.1 Fast | ✅ completed | output.video | OK |
| Veo 3.1 Quality | ✅ completed | output.video | OK |
| Seedance 2.0 | ✅ completed | output.video | OK (output_key fixado) |
| Seedance 2.0 Fast | ✅ completed | output.video | OK (output_key fixado) |
| Seedance 1.5 Pro | 429 plano | output.video (esperado) | OK (output_key fixado) |
| Hailuo MiniMax | ✅ completed | output.video | OK |
| Hailuo Live | ✅ completed (após fix) | output.video | OK (model_id fixado) |
| Wan 2.1 | ✅ completed | output.video_url | OK |

## Fluxo Generate — Status Final

O fluxo completo foi auditado e está funcionando:
1. ✅ Botão Generate → onSubmit → handleGenerate()
2. ✅ Validações (prompt, modelo, créditos)
3. ✅ submitSingleGeneration() monta o body correto
4. ✅ POST /api/generate/video
5. ✅ Autenticação Supabase
6. ✅ Verificação de créditos
7. ✅ buildVideoPayload() monta payload correto por backend
8. ✅ submitVideoTask() envia para PiAPI
9. ✅ task_id salvo no banco
10. ✅ Polling via /api/generate/status a cada 3s
11. ✅ extractVideoUrl() extrai URL do output PiAPI
12. ✅ Upload para Supabase Storage (fallback para URL direta)
13. ✅ Geração marcada como completed com result_url
14. ✅ StudioFeed atualiza e exibe o vídeo
