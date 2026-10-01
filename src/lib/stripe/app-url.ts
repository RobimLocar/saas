// URL pública usada nos retornos do Stripe (success/cancel do Checkout e
// return_url do Portal). Em produção, a ausência de NEXT_PUBLIC_APP_URL é erro
// de configuração: antes o código caía em http://localhost:3000 e o cliente
// pagante era devolvido para localhost (incidente de 25/09). Fora de produção
// (dev/test) o fallback local continua valendo.
export function stripeReturnBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (url) return url;
  if (process.env.NODE_ENV === "production") return null;
  return "http://localhost:3000";
}
