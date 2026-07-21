/*
 * safeRedirectTarget — defensa anti open-redirect (SECURITY §Validación).
 *
 * El vector clásico: un destino que PARECE interno (empieza con "/") pero el
 * navegador lo resuelve a un host EXTERNO, habilitando phishing con un dominio
 * de confianza en la barra:
 *   - "//evil.com"    → protocol-relative → https://evil.com
 *   - "/\evil.com"    → el navegador normaliza "\" → "/" → //evil.com
 *   - "/%2f%2fevil"   → queda como path interno (inofensivo), pero lo tratamos
 *                       igual con `new URL` para no depender de heurísticas.
 *
 * Dos consumidores con políticas distintas:
 *   - `safeRedirectTarget` (SOLO interno) → para `?next=` de auth y similares.
 *   - `isAllowedRedirectDestination` (interno O externo http(s) EXPLÍCITO) →
 *     para el CMS de redirects admin, que por diseño permite apuntar a partners.
 */

/**
 * ¿Contiene caracteres de control C0 (0x00–0x1F) o DEL (0x7F) embebidos? Uno de
 * estos en medio del path (p.ej. "/foo\nbar") puede burlar parsers de URL.
 * Se chequea por charCode para no incrustar bytes de control en el fuente.
 */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

/**
 * ¿Es un path interno seguro? Requiere:
 *  - empezar con exactamente UN "/" (no "//" — protocol-relative → host externo)
 *  - no contener "\" (los navegadores normalizan "\" → "/")
 *  - no contener caracteres de control / NUL (bypass de parsers)
 *  - resolver al MISMO origen contra una base arbitraria (chequeo autoritativo)
 */
export function isSafeInternalPath(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const s = input.trim();
  if (!s.startsWith("/")) return false; // debe ser un path absoluto del sitio
  if (s.startsWith("//")) return false; // protocol-relative → host externo
  if (s.includes("\\")) return false; // "\" se normaliza a "/" → //externo
  if (hasControlChars(s)) return false; // control chars / NUL embebidos
  // Chequeo autoritativo: contra una base cualquiera debe quedar en su origen.
  try {
    const base = "https://internal.invalid";
    if (new URL(s, base).origin !== base) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Devuelve un destino de redirect SEGURO e INTERNO, o `fallback` si `input` no
 * es un path interno seguro. Úsalo para consumir parámetros no confiables como
 * `?next=` tras login (nunca redirijas al valor crudo de la query).
 */
export function safeRedirectTarget(input: string | null | undefined, fallback = "/"): string {
  return isSafeInternalPath(input) ? input.trim() : fallback;
}

/**
 * Política del CMS de redirects (admin): acepta un destino si es
 *  - una URL absoluta https:// EXPLÍCITA (externo intencional, por diseño), o
 *  - un path interno seguro (`isSafeInternalPath`).
 * Rechaza los vectores disfrazados ("//evil.com", "/\evil.com") que parecen
 * internos pero escapan al host propio.
 *
 * Solo https:// (auditoría 2026-07-21, SEC-03): un destino http:// mandaría el
 * tráfico redirigido en claro y habilita downgrade si una cuenta admin se
 * compromete. No hay caso de uso legítimo de redirect externo sin TLS.
 */
export function isAllowedRedirectDestination(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const s = input.trim();
  if (/^https:\/\//i.test(s)) {
    try {
      return new URL(s).host.length > 0; // externo explícito válido
    } catch {
      return false;
    }
  }
  return isSafeInternalPath(s);
}
