/*
 * IP del cliente para rate-limit y auditoría (auditoría 2026-07-13).
 *
 * ANTES: cada sitio leía `x-forwarded-for` y tomaba el token IZQUIERDO, que el CLIENTE
 * controla → un atacante spoofea la IP y evade el rate-limit (abuso/credential-stuffing).
 *
 * AHORA: preferimos `x-vercel-forwarded-for`, que el edge de Vercel SOBREESCRIBE con la IP
 * real del cliente (el cliente no la puede falsear). Fallback a `x-forwarded-for` (primer
 * token) en entornos no-Vercel (dev local), y "unknown" si no hay nada.
 */

export function getClientIp(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}
