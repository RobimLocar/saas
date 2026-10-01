# Modelos de e-mail de autenticação (Supabase)

Cole cada arquivo em Supabase → Authentication → Emails → Templates, com o assunto indicado.
Variáveis do Supabase usadas: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}`.
O logotipo vem de https://www.fluxyra.app/fluxyra-mark.png.

| Template no Supabase | Arquivo | Assunto |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirme seu e-mail no Fluxyra |
| Reset Password | `reset-password.html` | Redefina sua senha do Fluxyra |
| Change Email Address | `change-email.html` | Confirme seu novo e-mail no Fluxyra |
| Magic Link | `magic-link.html` | Seu link de acesso ao Fluxyra |
