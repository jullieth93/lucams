/*
 * Atribución first-party sin PII (`Fase 12 · S25`).
 *
 * Propósito:
 *   Capturar `utm_source`, `utm_medium`, `utm_campaign` y `landingPath` en la primera
 *   visita con parámetros de campaña para atribuir ingresos reales en `Order` y
 *   `Opportunity` (LTV y margen por canal en `/admin/metricas`).
 *
 * Reglas de privacidad y seguridad (Ley 1581 + cero suposiciones):
 *   1. La cookie `lucams_utm` SOLO se persiste en navegador si el visitante otorgó
 *      consentimiento explícito de analíticas (`hasAnalyticsConsent() === true`).
 *      Si revoca el consentimiento, el tracker borra la cookie de inmediato.
 *   2. Cero PII: cualquier valor que contenga `@` (emails), secuencias numéricas de
 *      teléfono/documento (>= 7 dígitos seguidos) o tokens de rutas sensibles
 *      (`/pedido/[token]`, `/cotizacion/[token]`) es descartado o enmascarado antes
 *      de tocar cookie o base de datos.
 */

export const UTM_COOKIE_NAME = "lucams_utm";
export const UTM_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 días

export type UtmAttribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: string | null;
};

const DIGIT_RUN_RE = /\d{7,}/;
const UNSAFE_UTM_CHARS_RE = /[^a-zA-Z0-9._\-+/ ]/g;

/**
 * Sanitiza un parámetro UTM garantizando ausencia de PII (emails, teléfonos,
 * documentos) y acotando longitud y caracteres permitidos.
 */
export function sanitizeUtmValue(raw: string | null | undefined, maxLen = 80): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Rechazo estricto si parece email o contiene secuencias largas de dígitos (teléfono/cédula).
  if (trimmed.includes("@") || DIGIT_RUN_RE.test(trimmed)) {
    return null;
  }

  const cleaned = trimmed.replace(UNSAFE_UTM_CHARS_RE, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

/**
 * Sanitiza la ruta de aterrizaje sin query string ni tokens privados.
 */
export function sanitizeLandingPath(
  rawPath: string | null | undefined,
  maxLen = 160,
): string | null {
  if (typeof rawPath !== "string") return null;
  const base = rawPath.split("?")[0]?.split("#")[0]?.trim() ?? "";
  if (!base.startsWith("/")) return null;
  if (base.includes("@")) return null;

  const redacted = base
    .replace(/^\/pedido\/[^/]+/, "/pedido/[token]")
    .replace(/^\/cotizacion\/[^/]+/, "/cotizacion/[token]")
    .replace(/^\/carrito\/recuperar\/[^/]+/, "/carrito/recuperar/[token]");

  return redacted.slice(0, maxLen);
}

/**
 * Extrae atribución UTM desde `URLSearchParams` (o `ReadonlyURLSearchParams`).
 * Devuelve `null` cuando la navegación actual no trae ningún parámetro `utm_*`,
 * evitando sobrescribir la atribución original durante la navegación interna.
 */
export function extractUtmFromSearchParams(
  pathname: string,
  searchParams: { get(name: string): string | null },
): UtmAttribution | null {
  const utmSource = sanitizeUtmValue(searchParams.get("utm_source"), 80);
  const utmMedium = sanitizeUtmValue(searchParams.get("utm_medium"), 80);
  const utmCampaign = sanitizeUtmValue(searchParams.get("utm_campaign"), 120);

  if (!utmSource && !utmMedium && !utmCampaign) {
    return null;
  }

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    landingPath: sanitizeLandingPath(pathname, 160),
  };
}

type CompactCookiePayload = {
  s?: string | null;
  m?: string | null;
  c?: string | null;
  p?: string | null;
};

export function encodeUtmCookie(attr: UtmAttribution): string {
  const payload: CompactCookiePayload = {
    ...(attr.utmSource ? { s: attr.utmSource } : {}),
    ...(attr.utmMedium ? { m: attr.utmMedium } : {}),
    ...(attr.utmCampaign ? { c: attr.utmCampaign } : {}),
    ...(attr.landingPath ? { p: attr.landingPath } : {}),
  };
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Parsea y re-sanitiza el contenido de `lucams_utm` en servidor (nunca confiamos
 * ciegamente en bytes enviados por el cliente).
 */
export function parseUtmCookie(rawCookieValue: string | null | undefined): UtmAttribution | null {
  if (!rawCookieValue || typeof rawCookieValue !== "string") return null;
  if (rawCookieValue.length > 1024) return null;

  try {
    const decoded = decodeURIComponent(rawCookieValue);
    const parsed = JSON.parse(decoded) as CompactCookiePayload;
    if (!parsed || typeof parsed !== "object") return null;

    const utmSource = sanitizeUtmValue(parsed.s ?? null, 80);
    const utmMedium = sanitizeUtmValue(parsed.m ?? null, 80);
    const utmCampaign = sanitizeUtmValue(parsed.c ?? null, 120);
    const landingPath = sanitizeLandingPath(parsed.p ?? null, 160);

    if (!utmSource && !utmMedium && !utmCampaign && !landingPath) {
      return null;
    }

    return { utmSource, utmMedium, utmCampaign, landingPath };
  } catch {
    return null;
  }
}
