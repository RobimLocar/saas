# Fluxyra

Plataforma **SaaS multimodal de geração de mídia com IA**.

## Stack
- Next.js (App Router, `src/`) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (auth + banco)
- Stripe (billing)
- PiAPI (geração de imagem/vídeo/áudio)
- Atlas
- Zustand, TanStack React Query, Framer Motion

## Desenvolvimento
```bash
npm install
cp .env.local.example .env.local   # preencha as variáveis
npm run dev
```

Estrutura de rotas em `src/app`: `(auth)`, `(dashboard)`, `(marketing)` e rotas de API em `src/app/api`.
