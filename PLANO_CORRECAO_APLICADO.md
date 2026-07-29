# Plano de Correção Aplicado — Fluxyra (plano de 26/07)

Documento de fechamento das correções P0→P2 do plano de 26/07, implementadas no
repositório `saas` (Next.js 16 / TypeScript, branch `feat/f3-piapi-landing-pricing`,
deploy `https://5be3213ef.abacusai.cloud`, systemd `fluxyra.service` na porta 3000).

- **Build:** `npx tsc --noEmit` → OK (rc=0) · `npm run build` → OK (rc=0)
- **Serviço:** `systemctl is-active fluxyra.service` → `active`
- **Smoke test:** `GET /` → 200 · `GET /api/models` → 200 · `POST /api/webhooks/piapi` sem assinatura → 401
- **Verificação final (`GET /api/models?type=video`):** 15/15 modelos retornam o campo
  `less_restriction`; apenas **"Seedance 2.0 — Rosto Real"** vem com `less_restriction: true`.
- **Nenhuma task paga foi criada na PiAPI durante a implementação.**

| Item | Escopo | Status |
|------|--------|--------|
| §2 | Seedance "Rosto Real" (less-restriction para imagens de referência) | **IMPLEMENTADO** |
| §3.1 | Webhook PiAPI + unificação do path de storage | **IMPLEMENTADO** |
| §3.2 | Validações locais antes do débito | **IMPLEMENTADO** |
| §3.3 | Débito/estorno de créditos atômico e idempotente | **PARCIAL** (garantias ativas em código; RPC SQL criada mas não aplicada) |
| §3.4 | Timeout de gerações presas (30 min) | **IMPLEMENTADO** |
| §3.5 | Higiene: dead code + documentação de divergências | **IMPLEMENTADO** |
| Integridade | Exposição de `less_restriction` na `/api/models` + verificação end-to-end | **IMPLEMENTADO** |

---

## §2 — Seedance "Rosto Real" (variante less-restriction) — IMPLEMENTADO

### O que foi feito
1. **`task_type` dinâmico** — `src/lib/piapi/client.ts` (`buildVideoPayloadInner`, bloco Seedance ~l.437-511).
   O tipo de task passa a ser montado em tempo de execução:
   ```ts
   const useLR = args.lessRestriction === true || hasImages;
   const base =
     args.seedanceTier === "fast"  ? "seedance-2-fast"
     : args.seedanceTier === "mini" ? "seedance-2-mini"
     : args.seedanceTier === "pro"  ? "seedance-2"
     : (params.task_type || "seedance-2").replace(/-less-restriction$/, "");
   const taskType = useLR ? `${base}-less-restriction` : base;
   ```
   - `useLR` é verdadeiro quando o catálogo força (`params.less_restriction === true`)
     **ou** quando há qualquer imagem de referência anexada (`hasImages`).
   - O tier vem do catálogo (`seedance_tier`) ou é inferido do `task_type`.

2. **`auto_upload_assets` + `asset_retention_hours`** — só entram no `input` na variante
   less-restriction **com** imagens (l.501-507):
   ```ts
   if (useLR && hasImages) {
     input.auto_upload_assets = true;
     input.asset_retention_hours = 3;
   }
   ```
   Isso pede à PiAPI que hospede internamente os assets de referência (necessário
   para o pipeline less-restriction). Fora desse caso, o flag **não** é enviado.

3. **Campos no tipo** — `src/lib/piapi/client.ts`:
   - `BuildVideoArgs`: `lessRestriction?: boolean` (l.350) e `seedanceTier?: "pro"|"fast"|"mini"` (l.352).
   - `VideoModelParams`: `less_restriction?: boolean` (l.331) e `seedance_tier?: "pro"|"fast"|"mini"` (l.333).

4. **Repasse na rota** — `src/app/api/generate/video/route.ts` (chamada `buildVideoPayload`, l.276-285):
   ```ts
   lessRestriction: modelParams.less_restriction === true || body?.less_restriction === true,
   seedanceTier: modelParams.seedance_tier || (body?.seedance_tier as "pro"|"fast"|"mini") || undefined,
   ```

5. **Catálogo** — novo modelo **"Seedance 2.0 — Rosto Real"** criado via
   `scripts/add-seedance-real.mjs` com `params.less_restriction=true`,
   `params.task_type="seedance-2-less-restriction"`, `params.seedance_tier="pro"`,
   `credit_cost=75`.

6. **UI** — `src/components/studio/generation-dock.tsx`:
   - `isRealFaceModel` detecta o modelo por `less_restriction === true` **ou**
     `task_type` contendo `less-restriction` **ou** badge `REAL`.
   - Aviso de responsabilidade (consentimento) exibido quando `isRealFaceModel && hasAnyImageRef`.
   - Dica de prompt `@image1` para Seedance com imagem.

### Antes vs depois
- **Antes:** toda geração Seedance usava a variante estrita, que bloqueia rostos reais;
  imagens de pessoas reais eram rejeitadas pelo provider.
- **Depois:** com imagem de referência (ou modelo "Rosto Real"), o payload usa a variante
  `-less-restriction` com `auto_upload_assets`, permitindo referências com pessoas reais
  (a responsabilidade de uso é do usuário, com aviso na UI).

### Como testar
- Sem task paga: ver a seção **"Como testar o Seedance Rosto Real"** no fim deste documento
  (a confirmação completa exige uma geração real).

### Limitações
- A decisão final sobre o que pode ser gerado continua sendo **exclusivamente do provider**
  (PiAPI). Não há filtro de conteúdo próprio no app.

---

## §3.1 — Webhook PiAPI + unificação do path de storage — IMPLEMENTADO

### O que foi feito
1. **Registro do webhook no payload da PiAPI** — `src/lib/piapi/client.ts` (`buildVideoPayloadInner`, ~l.421-431).
   Quando **ambas** as variáveis `PUBLIC_BASE_URL` e `PIAPI_WEBHOOK_SECRET` estão
   definidas, o payload passa a incluir:
   ```ts
   const config: Record<string, unknown> = { service_mode: "public" };
   if (process.env.PUBLIC_BASE_URL && process.env.PIAPI_WEBHOOK_SECRET) {
     config.webhook_config = {
       endpoint: `${process.env.PUBLIC_BASE_URL}/api/webhooks/piapi`,
       secret: process.env.PIAPI_WEBHOOK_SECRET,
     };
   }
   ```
   Se as vars não existirem, o comportamento anterior é mantido (sem webhook) —
   o fluxo continua funcionando via polling da rota de status.

2. **Variáveis de ambiente** — `.env.local` (arquivo **gitignored**, não versionado):
   - `PUBLIC_BASE_URL=https://5be3213ef.abacusai.cloud`
   - `PIAPI_WEBHOOK_SECRET=<uuid v4 gerado, 36 chars>` (mascarado; não exposto neste relatório)

3. **Rota de webhook reescrita** — `src/app/api/webhooks/piapi/route.ts`:
   - Lê `rawBody` via `req.text()` antes de qualquer parse (necessário para validar HMAC).
   - `verifySignature(rawBody, headers)` aceita **duas** formas:
     - segredo em texto no header (`x-webhook-secret` / `x-piapi-secret` / `x-api-key`);
     - HMAC SHA256 hex em `x-signature` / `x-webhook-signature` / `x-piapi-signature`.
     - Comparação com `timingSafeEqual`. Se `PIAPI_WEBHOOK_SECRET` não estiver
       configurado, a verificação passa (fail-open apenas quando o operador não
       configurou segredo).
   - Parse tolerante (`parsed.data` aninhado **ou** payload plano); extrai
     `task_id`, `status`, `output`, `error`.
   - Busca a `generation` pelo `provider_task_id`.
   - **Idempotência:** se a generation já está `completed`/`failed`, retorna 200 sem reprocessar.
   - **status `failed`:** atualiza a generation e chama `refundCredits` (idempotente).
   - **status `completed`:** extrai a URL do vídeo, baixa o arquivo, faz upload para o
     bucket `assets` no path unificado e atualiza `result_url` + `status=completed`.
   - Estados intermediários apenas sincronizam status.
   - `auditLog` em todos os ramos.

4. **Unificação do path de storage** — webhook e rota de status agora gravam no
   **mesmo** padrão **singular**:
   ```
   {user_id}/{type}/{generation_id}.{ext}   →  bucket "assets"
   ```
   (`src/app/api/webhooks/piapi/route.ts`, l.176).

   > **Decisão documentada:** o plano sugeria o plural (`videos/`), mas a instrução
   > pedia para verificar antes de decidir. A inspeção do bucket `assets` em produção
   > mostrou que os dados **já existentes** usam pastas **singulares** (`video`,
   > `image`, `audio`), gravadas pela rota de status ativa. Para manter consistência
   > com os dados reais e com o writer já em produção, unifiquei no **singular**
   > (ajustei o webhook de plural→singular). Sem impacto funcional: `result_url`
   > guarda a URL pública absoluta.

### Antes vs depois
- **Antes:** nenhum `webhook_config` no payload → a PiAPI nunca notificava; a
  conclusão dependia 100% do polling. O path de storage divergia entre webhook
  (plural) e status route (singular).
- **Depois:** a PiAPI notifica em `/api/webhooks/piapi` (quando as vars existem),
  com assinatura validada; conclusão/falha processadas via webhook **ou** polling
  (ambos idempotentes); path unificado.

### Como testar (sem task paga)
- `POST /api/webhooks/piapi` sem assinatura → **401** (`{"error":"Assinatura inválida"}`).
- `POST /api/webhooks/piapi` com header `x-webhook-secret: <PIAPI_WEBHOOK_SECRET>` e
  corpo `{"task_id":"<inexistente>","status":"completed"}` → 200/ok (generation não
  encontrada é tratada sem erro).
- Verificar no bucket `assets` que novas mídias caem em `{user_id}/video/{id}.mp4`.

---

## §3.3 — Débito/estorno atômico e idempotente — PARCIAL

### O que foi feito
1. **Helpers em código** — `src/lib/credits.ts` (novo):
   - `debitCredits(service, userId, jobId, amount, requestId)`:
     débito via **compare-and-swap** (lê `credits_balance`, faz
     `update ... .eq("credits_balance", current)` com **retry**), garantindo que
     dois débitos concorrentes não corrompam o saldo. Registra o lançamento em
     `credit_transactions` com `reason: "generation"` e `related_job_id: jobId`.
     Retorna `{ ok, balance }` ou `{ ok:false, reason:"insufficient" }`.
   - `refundCredits(service, userId, jobId, amount?, requestId)`:
     **idempotente** — antes de creditar, verifica se já existe lançamento
     `reason="refund"` para o mesmo `related_job_id`; se existir, não credita de novo.
     Se `amount` não for passado, deriva do débito original (`reason="generation"`).
     Credita e registra lançamento `reason="refund"`.
   - Ambos usam o **service client** (contorna RLS de forma robusta).

2. **RPC SQL** — `supabase/migrations/0002_rpc_credits.sql` (novo):
   funções `debit_credits` / `refund_credits` em PL/pgSQL, alinhadas ao schema de
   produção (reason `generation`/`refund`), para débito/estorno atômicos no banco.

3. **Substituição no fluxo** — `src/app/api/generate/video/route.ts`:
   - débito manual (select + update + insert de ledger) → `debitCredits` (l.222);
   - se `!ok`: marca a generation como `failed` e responde **402** (insufficient) ou
     **500** (outro erro), sem cobrar;
   - `catch` usa `refundCredits` idempotente (l.330), mantendo a classificação de
     erro 402/503/502.
   - `src/app/api/generate/status/route.ts` e o webhook também usam `refundCredits`.

### Por que PARCIAL
A **RPC SQL não foi aplicada** ao banco hospedado: o Supabase deste projeto **não
expõe DDL via service role** (a RPC `exec_sql` responde 404 e não há connection
string Postgres disponível para rodar a migration). Portanto:

- A migration `0002_rpc_credits.sql` fica como **artefato a aplicar manualmente**
  (Supabase → SQL Editor → colar e executar).
- **Enquanto a RPC não é aplicada**, as garantias de atomicidade/idempotência
  rodam em `src/lib/credits.ts` (CAS com retry + check-then-act idempotente). O
  código **não** chama `supabase.rpc('debit_credits'...)` — isso quebraria em
  produção, pois a função ainda não existe no banco.

### Antes vs depois
- **Antes:** débito = select saldo → update → insert ledger, sem proteção contra
  corrida e sem idempotência no estorno (risco de débito duplo/estorno duplo).
- **Depois:** débito com CAS+retry; estorno idempotente por `related_job_id`.

### Como testar (sem task paga)
- Inspecionar `credit_transactions` após uma tentativa: deve haver **um** lançamento
  `reason="generation"` por generation, e no máximo **um** `reason="refund"` por job.
- Forçar duas chamadas de estorno para o mesmo `job_id` → apenas **um** crédito é
  devolvido (o segundo é no-op).
- Para ativar a versão em banco: aplicar `supabase/migrations/0002_rpc_credits.sql`
  no SQL Editor.

### Limitações
- O estorno idempotente é **check-then-act** em código: sob concorrência extrema
  existe uma pequena janela teórica de corrida. A aplicação da RPC SQL (0002)
  elimina essa janela ao mover a lógica para dentro de uma transação no banco.

---

## §3.2 — Validações locais antes do débito — IMPLEMENTADO

### O que foi feito
- `src/lib/generation-validation.ts` (novo) — `validateVideoRequest(input, modelParams, requestId)`:
  - **URLs de referência:** devem ser `http(s)`; caso contrário → resultado inválido
    (a rota responde **400**). HEAD probe de 3s **não-bloqueante**
    (`Promise.allSettled`) — falha de rede na sondagem não reprova o request.
  - **aspect_ratio:** se enviado, precisa constar na lista suportada pelo modelo
    (`params.supported_aspect_ratios` quando presente, senão defaults por backend:
    seedance/kling/hailuo/veo3/wan/ltx).
  - **duration:** validada contra `dur_min` / `dur_max` dos params do modelo.
- Integração em `src/app/api/generate/video/route.ts` (l.154-171): a validação roda
  **antes** de qualquer débito; se inválida → **400** e **nenhum crédito é cobrado**.

### Antes vs depois
- **Antes:** parâmetros inválidos só eram rejeitados pela PiAPI, **depois** do
  débito → usuário perdia crédito (dependia do estorno) e gastava uma chamada.
- **Depois:** rejeição local com **400** antes do débito.

### Como testar (sem task paga)
- `aspect_ratio` inexistente para o modelo → **400** (sem débito).
- URL de referência não-http (ex.: `ftp://...` ou `data:`) → **400**.
- `duration` fora de `[dur_min, dur_max]` → **400**.

---

## §3.4 — Timeout de gerações presas (30 min) — IMPLEMENTADO

### O que foi feito
- `src/app/api/generate/status/route.ts`:
  - `timeoutMin = Number(process.env.GENERATION_TIMEOUT_MINUTES) || 30` (l.77).
  - `isStale` = generation com `created_at` mais antigo que `timeoutMin` (l.79).
  - `timeoutIfStale()` (l.80): quando `isStale`, marca a generation como `failed`,
    chama `refundCredits` (idempotente) e retorna 200 com status `failed`.
  - Chamado nos ramos "ainda processando" (l.290) e no `catch` do poll (l.305),
    antes de responder `processing` — assim uma generation travada é encerrada e
    estornada no próximo poll do cliente.
  - O ramo `failed` também usa `refundCredits` (l.277).

### Antes vs depois
- **Antes:** generation presa em `processing` ficava assim indefinidamente; crédito
  nunca era devolvido.
- **Depois:** após `GENERATION_TIMEOUT_MINUTES` (default 30), é marcada `failed` e
  estornada automaticamente.

### Como testar (sem task paga)
- Em ambiente de teste, dar `UPDATE generations SET created_at = now() - interval '40 minutes'`
  em uma generation `processing` e chamar `GET /api/generate/status?id=...` →
  retorna `failed` e registra estorno em `credit_transactions`.
- Ou setar `GENERATION_TIMEOUT_MINUTES=0` temporariamente para forçar o timeout.

### Limitações
- O timeout é acionado pelo **polling** da rota de status (não é um job cron). Uma
  generation só é encerrada quando o cliente (ou o webhook) tocar a rota novamente.
  Para expiração garantida sem polling seria necessário um cron/worker externo.

---

## §3.5 — Higiene: dead code + documentação de divergências — IMPLEMENTADO

### Dead code removido (`git rm`, 0 imports confirmados)
- `src/hooks/use-generation.ts`
- `src/components/studio/media-gallery.tsx`

### Divergências de schema documentadas
- **`supabase/migrations/0001_init.sql` NÃO corresponde à produção.** É um schema
  "v2/fantasia" (nomes e colunas diferentes). A **fonte de verdade** é
  `supabase/SCHEMA_PRODUCAO.md`. A migration 0001 **não deve ser executada** contra
  o banco de produção. As novas funcionalidades (créditos, ledger, storage) foram
  todas alinhadas ao schema real:
  - `profiles(id, email, credits_balance, stripe_customer_id, plan, plan_credits_monthly, created_at)`
  - `credit_transactions(id, user_id, amount, reason[welcome/subscription/topup/generation/refund], related_job_id, created_at)`
  - `generations(id, user_id, model_id, type, prompt, ..., status, result_url, provider_task_id, credits_used, error_message, created_at, updated_at)`
  - buckets: `uploads` (referências enviadas) e `assets` (mídias geradas).

### Duplicação de endpoints documentada (NÃO alterada)
- `/api/me` e `/api/credits` retornam essencialmente o mesmo dado
  (`{ credits: profile.credits_balance, plan }`). Recomenda-se unificar no futuro,
  mas **não foi alterado agora** para evitar regressão em consumidores existentes.

---

## Arquivos alterados nesta entrega

**Criados**
- `src/lib/credits.ts`
- `src/lib/generation-validation.ts`
- `supabase/migrations/0002_rpc_credits.sql`
- `PLANO_CORRECAO_APLICADO.md` (este relatório)

**Modificados**
- `src/lib/piapi/client.ts` (webhook_config)
- `src/app/api/generate/video/route.ts` (validação + débito/estorno via helpers)
- `src/app/api/generate/status/route.ts` (timeout + estorno)
- `src/app/api/webhooks/piapi/route.ts` (reescrito)
- `.env.local` (gitignored — vars `PUBLIC_BASE_URL`, `PIAPI_WEBHOOK_SECRET`)

**Removidos**
- `src/hooks/use-generation.ts`
- `src/components/studio/media-gallery.tsx`

## Verificação de integridade final — IMPLEMENTADO

### O que foi feito
1. **Exposição de `less_restriction` na `/api/models`** — `src/app/api/models/route.ts`
   (map de modelos, l.71):
   ```ts
   less_restriction: p.less_restriction === true,
   ```
   Antes, a `/api/models` expunha `task_type` mas **não** o `less_restriction`; o
   frontend só conseguia detectar o modelo "Rosto Real" pelo `task_type`/badge. Agora
   o campo é explícito, tornando a detecção robusta.

2. **UI mais robusta** — `src/components/studio/generation-dock.tsx`:
   - Interface `AiModel` recebeu `less_restriction?: boolean` (l.67).
   - `isRealFaceModel` agora considera `selectedModel.less_restriction === true` como
     primeira condição (além de `task_type`/badge).

3. **Verificação end-to-end do pipeline** (leitura de código, sem task paga):
   - `VideoModelParams` inclui `less_restriction?` e `seedance_tier?` → TypeScript OK.
   - Webhook `src/app/api/webhooks/piapi/route.ts`: HMAC via `PIAPI_WEBHOOK_SECRET`;
     `completed` baixa mídia → upload no bucket `assets` → `status=completed`+`result_url`;
     `failed` → `refundCredits` idempotente + `status=failed`.
   - **Path de storage unificado** entre webhook e `status/route.ts`: ambos usam bucket
     `assets` e path `${user_id}/${type}/${generation_id}.${ext}`, mesmo campo
     `credits_used` e mesma função `refundCredits`.

### Evidência (verificação executada)
```
GET /api/models?type=video → 200
total video models: 15
com campo less_restriction: 15
less_restriction==true: ['Seedance 2.0 — Rosto Real']
```

---

## Como testar o Seedance Rosto Real (passo a passo para o usuário)

> Este teste **cria uma task paga** na PiAPI (modelo "Rosto Real" = 75 créditos). Faça
> apenas quando quiser validar de ponta a ponta.

**Passos:**
1. No Studio, abra a aba **Vídeo** e selecione o modelo **"Seedance 2.0 — Rosto Real"**.
2. Anexe uma **imagem de referência** com uma pessoa (start frame, referência única ou
   omni). → Deve aparecer o aviso: *"Use apenas imagens com consentimento do titular. A
   responsabilidade pelo uso é do usuário."*
3. Escreva um prompt mencionando a imagem, ex.: *"@image1 é a pessoa de referência,
   caminhando numa praia ao pôr do sol"*.
4. Clique em **Gerar**.

**O que confirmar (nos logs `logs/app.log` — filtre pelo `requestId` da geração):**

1. **`task_type` correto** — no evento `piapi.buildVideoPayload`/`saida`, o campo
   `task_type` deve ser **`seedance-2-less-restriction`** (não `seedance-2`).
   ```
   grep '"stage":"piapi.buildVideoPayload"' logs/app.log | grep '"event":"saida"' | tail -1
   ```
   Deve mostrar `"task_type":"seedance-2-less-restriction"` e `"less_restriction":true`.

2. **`auto_upload_assets=true` no payload** — no mesmo evento `saida`, o campo
   `auto_upload_assets` deve ser `true` (e o `input` deve conter `asset_retention_hours: 3`).

3. **Sem "O provider rejeitou a solicitação"** — a geração NÃO deve falhar com essa
   mensagem por causa de rosto real. (Se falhar por outro motivo do provider, a mensagem
   original dele é preservada — o app não substitui por texto próprio.)
   ```
   grep '<requestId>' logs/app.log | grep -i "rejeitou\|piapi_erro_estorno"
   ```
   → não deve haver estorno por rejeição de conteúdo.

4. **Vídeo entregue e salvo** — ao concluir (via webhook ou polling de status), a
   generation fica `status=completed` com `result_url` apontando para o bucket `assets`
   (`.../assets/<user_id>/video/<generation_id>.mp4`). No feed do Studio o vídeo aparece
   normalmente.

**Se algo falhar:**
- `task_type` sem `-less-restriction` → conferir `params.less_restriction`/`seedance_tier`
  do modelo no banco e o repasse em `video/route.ts` (l.276-285).
- Ausência de `auto_upload_assets` → confirmar que há imagem anexada (`hasImages`) e que
  `useLR` ficou verdadeiro.
- Falha por rejeição de conteúdo → é decisão do **provider** (PiAPI), não do app.

---

## Commits (um por bloco)
1. `feat: seedance less-restriction for reference images (§2 plano 26/07)` — `066ddc5`
2. `feat: webhook piapi + unified storage path (§3.1)` — `2c8a839`
3. `feat: atomic credits debit/refund RPC (§3.3)` — `e06fc37`
4. `feat: local validation before debit (§3.2)` — `b987c21`
5. `fix: generation timeout 30min (§3.4)` — `639854b`
6. `chore: remove dead code, document schema divergences (§3.5)` — `02dc59d`
7. `fix: handle non-JSON PiAPI responses (502), respect user resolution selection, remove content filters` — `e798aba`
8. `fix: expose less_restriction in /api/models, final integrity check` — `01179e7`

> Observação sobre a granularidade dos commits: os arquivos
> `video/route.ts` e `status/route.ts` concentram mudanças de mais de um bloco
> (validação + débito + timeout). Como o git versiona o arquivo inteiro, cada um
> foi incluído no commit do bloco predominante (video→§3.3, status→§3.4), com a
> menção às demais mudanças no corpo do commit.

## Ações manuais pendentes (para o operador)
1. Aplicar `supabase/migrations/0002_rpc_credits.sql` no Supabase SQL Editor para
   ativar as RPCs atômicas no banco (o código já funciona sem isso, via CAS).
2. Confirmar que `PUBLIC_BASE_URL` e `PIAPI_WEBHOOK_SECRET` estão presentes no
   ambiente de produção (estão em `.env.local`, que é gitignored).
3. (Opcional) Configurar um cron/worker para expirar gerações presas sem depender
   do polling (§3.4).
