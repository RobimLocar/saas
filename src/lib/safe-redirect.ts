/**
 * Só aceita caminhos internos ("/studio", "/pricing#recarga"). Qualquer outra
 * coisa — URL absoluta, "//site.com", "/\site.com", esquemas, controle — vira
 * o fallback. Evita open redirect via ?redirect= / ?next= (phishing: o
 * usuário loga no Fluxyra e é jogado num site falso).
 */
export function safeRedirectPath(value: unknown, fallback = "/studio"): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(v)) return fallback;
  try {
    const u = new URL(v, "http://fluxyra.local");
    if (u.host !== "fluxyra.local") return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
