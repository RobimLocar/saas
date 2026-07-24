# Fluxyra — Estado Atual do Repositório

**Data:** 24/07/2026 | **Branch principal:** `main`

---

## ✅ O que já foi implementado

### Fase 1 — Scaffold & Fundação
- [x] Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- [x] Estrutura de pastas completa (app router, components, lib, hooks, stores, types)
- [x] Design System dark (#0A0A0A, accent violeta #7C3AED, fonte Inter)
- [x] Schema Supabase completo (10 tabelas + RLS + triggers)
- [x] Seed data (4 planos + 7 modelos de IA)
- [x] Variáveis de ambiente (.env.local.example)

### Fase 2 — Studio + Auth
- [x] Sidebar com navegação completa (Studio, Flows, Wise, Influencer Studio, UGC Factory, Seeds, Assets, My Prompts)
- [x] Topbar com logo e título dinâmico
- [x] Galeria masonry responsiva com cards de mídia
- [x] Dock de geração (abas Imagem/Vídeo/Áudio + prompt + controles)
- [x] Login/Signup com Supabase Auth (Server Actions)
- [x] Middleware de proteção de rotas
- [x] Páginas placeholder para Flows, Assets, Seeds, My Prompts

### Fase 3 — PiAPI + Stripe + Landing + Pricing
- [x] **Cliente PiAPI completo** — `generateImage()`, `generateVideo()`, `generateAudio()`, `getTaskStatus()`, `extractResultUrl()`
- [x] **API Routes de geração** — `/api/generate/image`, `/api/generate/video`, `/api/generate/audio`
- [x] **API Route de polling** — `/api/generate/status` (checa PiAPI e atualiza banco)
- [x] **Webhook PiAPI** — `/api/webhooks/piapi` (auto-save assets no Storage + reembolso automático em falhas)
- [x] **Stripe client** — planos (Starter/Pro/Agency) + 5 packs de top-up
- [x] **Checkout Stripe** — `/api/stripe/create-checkout` (assinatura OU top-up)
- [x] **Webhook Stripe** — handles: checkout.completed, invoice.succeeded, subscription.updated/deleted, payment_failed
- [x] **Renovação mensal** com rollover parcial (Pro: 100cr, Agency: 500cr)
- [x] **Landing Page** — hero, modalidades, features, tabela de modelos, comparação competitiva, CTA
- [x] **Pricing Page** — 4 cards de planos + toggle mensal/anual (−20%) + 5 packs avulsos
- [x] **useGeneration hook** — submit + polling automático
- [x] **useCredits hook** — react-query com auto-refresh a cada 30s
- [x] **Studio Store** expandido (activeTab, prompt, model, params, references, viewFilter)
- [x] **API Credits** — `/api/credits` (retorna saldo + plano)
- [x] **API Assets** — `/api/assets` (list com filtros + delete)

---

## 🔜 Próximas fases (pendente)

### Fase 4 — Seeds + Saved Prompts
- [ ] CRUD de Seeds (personagens reutilizáveis)
- [ ] CRUD de Saved Prompts
- [ ] Integração Seeds com Studio (usar como referência)

### Fase 5 — Flows
- [ ] Flow builder (definir steps encadeados)
- [ ] Templates pré-construídos (UGC, Influencer, Podcast, Avatar)
- [ ] Execução automatizada de flows

### Fase 6 — Apps Especializados
- [ ] Influencer Studio (foto→vídeo com persona)
- [ ] UGC Factory (batch de vídeos)

### Fase 7 — Wise (Assistente IA)
- [ ] Melhoria de prompts com IA
- [ ] Recomendação de modelo
- [ ] Estimativa de créditos

### Fase 8 — Deploy & Monitoring
- [ ] Deploy na Vercel
- [ ] Sentry para erros
- [ ] PostHog para analytics
- [ ] Onboarding gamificado
- [ ] Emails transacionais (Resend)
- [ ] Referral system

---

## 📊 Métricas do Build

- **TypeScript errors:** 0
- **Build errors:** 0
- **Rotas:** 21 (11 pages + 10 API routes)
- **Componentes:** 20+ (ui + shared + studio)

## 🔗 PRs no GitHub

| # | Título | Status |
|---|--------|--------|
| 1 | feat: Initial project setup | ✅ Merged |
| 2 | feat(F1): Fundação — design system, schema, RLS, auth | ✅ Merged |
| 3 | feat(F2): Studio + Auth — dashboard shell, galeria, dock | ✅ Merged |
| 4 | chore: merge all foundation into main | ✅ Merged |
| 5 | feat(F3): PiAPI + Stripe + Landing + Pricing | 🔵 Open |
