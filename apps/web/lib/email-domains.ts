/*
 * Email domain helpers — autocomplete + detección de typos comunes.
 *
 * Lucy 2026-05-21: "cuando se escribe el @, sugerir dominio comunes".
 */

// Top 10 dominios cubren ~95% de emails en Colombia. Ordenados por
// popularidad (gmail dominante, hotmail/outlook fuertes en CO por Live).
export const COMMON_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "live.com",
  "icloud.com",
  "protonmail.com",
  "yahoo.es",
  "hotmail.es",
  "outlook.es",
];

/**
 * Dado un email parcial (con o sin '@'), devuelve hasta `limit`
 * sugerencias de autocompletado.
 *
 *   "lucy"        → []  (no hay @)
 *   "lucy@"       → ["lucy@gmail.com", "lucy@hotmail.com", ...]
 *   "lucy@g"      → ["lucy@gmail.com"]
 *   "lucy@gmail." → []  (ya tiene dominio completo)
 */
export function suggestEmails(input: string, limit = 5): string[] {
  const atIdx = input.indexOf("@");
  if (atIdx < 0) return [];

  const localPart = input.slice(0, atIdx);
  const domainPartial = input.slice(atIdx + 1).toLowerCase();
  if (!localPart) return [];

  // Si el dominio parcial ya contiene un punto, no autocompletamos (asumimos
  // que ya escribió un dominio completo o casi).
  // Excepción: si es "gmail.c" o similar (typo incompleto), sí sugerimos.
  if (domainPartial.length === 0) {
    return COMMON_DOMAINS.slice(0, limit).map((d) => `${localPart}@${d}`);
  }

  const matches = COMMON_DOMAINS.filter((d) => d.startsWith(domainPartial)).slice(0, limit);
  return matches.map((d) => `${localPart}@${d}`);
}

/**
 * Detecta typos comunes en dominios (similar a mailcheck.js pero más
 * liviano). Si encuentra un match cercano, retorna la sugerencia.
 *
 *   "lucy@gmial.com"  → "lucy@gmail.com"
 *   "lucy@hotnail.com" → "lucy@hotmail.com"
 *   "lucy@gmail.com"  → null (no typo)
 */
const TYPO_MAP: Record<string, string> = {
  // gmail variants
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.con": "gmail.com",
  "gmaill.com": "gmail.com",
  "gemail.com": "gmail.com",
  // hotmail variants
  "hotnail.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hormail.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  // outlook variants
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "ourlook.com": "outlook.com",
  // yahoo variants
  "yaho.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahho.com": "yahoo.com",
  // icloud variants
  "iclod.com": "icloud.com",
  "icould.com": "icloud.com",
  "iclud.com": "icloud.com",
};

export function detectEmailTypo(email: string): string | null {
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return null;
  const localPart = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1).toLowerCase();
  const fixed = TYPO_MAP[domain];
  return fixed ? `${localPart}@${fixed}` : null;
}

/**
 * Validación de formato email estricta (más estricta que el regex
 * permisivo de la mayoría de libs). Acepta:
 *   - usuario.usuario+tag@dominio.com
 *   - usuario_123@subdom.dom.com
 * Rechaza:
 *   - Espacios, caracteres raros
 *   - Dominios sin TLD
 *   - Local part mayor a 64 caracteres (límite RFC 5321)
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  const atIdx = trimmed.indexOf("@");
  if (atIdx < 0 || atIdx > 64) return false; // local part max 64
  return EMAIL_REGEX.test(trimmed);
}
