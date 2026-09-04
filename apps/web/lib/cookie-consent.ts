/*
 * Helper de consentimiento de cookies (Ley 1581 / Decreto 1377 CO).
 *
 * Persiste preferencias en cookie `cookie_consent_v1` (1 año,
 * SameSite=Lax). Cookie es client-readable (no HttpOnly) para que
 * scripts client-side (futuro analytics/marketing) puedan consultarla.
 *
 * Estructura JSON encoded en la cookie:
 *   {
 *     v: 1,                           // versión del banner
 *     necessary: true,                // siempre true (locked)
 *     functional: boolean,
 *     analytics: boolean,
 *     marketing: boolean,
 *     savedAt: string ISO 8601,
 *   }
 *
 * Si la cookie no existe → banner aparece. Tras click se setea
 * Y se registra una fila por scope en la tabla Consent (audit trail).
 */

export const COOKIE_CONSENT_NAME = "cookie_consent_v1";
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 año

export type CookiePreferences = {
  v: number;
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
};

/** Estado por defecto cuando el usuario aún no decidió. */
export function emptyPreferences(): CookiePreferences {
  return {
    v: COOKIE_CONSENT_VERSION,
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    savedAt: "",
  };
}

/** Solo necesarias. */
export function rejectAllPreferences(): CookiePreferences {
  return {
    v: COOKIE_CONSENT_VERSION,
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
    savedAt: new Date().toISOString(),
  };
}

/** Acepta todas las cookies (incluyendo opcionales). */
export function acceptAllPreferences(): CookiePreferences {
  return {
    v: COOKIE_CONSENT_VERSION,
    necessary: true,
    functional: true,
    analytics: true,
    marketing: true,
    savedAt: new Date().toISOString(),
  };
}

/** Lee la cookie client-side. Devuelve null si no existe o es inválida. */
export function readClientCookiePreferences(): CookiePreferences | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_CONSENT_NAME}=([^;]+)`));
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as Partial<CookiePreferences>;
    if (parsed.v !== COOKIE_CONSENT_VERSION) return null; // versión vieja → re-consent
    return {
      v: COOKIE_CONSENT_VERSION,
      necessary: true,
      functional: !!parsed.functional,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * True only when the visitor explicitly accepted the "Analíticas" category.
 * No cookie stored yet (visitor has not answered the banner) → false:
 * optional categories are opt-in, so nothing analytics-related runs until
 * there is an affirmative answer. Re-read on every call so a mid-session
 * choice takes effect without reloading.
 */
export function hasAnalyticsConsent(): boolean {
  return readClientCookiePreferences()?.analytics === true;
}

/** Persiste la cookie + dispara evento custom para que listeners reaccionen. */
export function writeClientCookiePreferences(prefs: CookiePreferences) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(prefs));
  const attrs = [
    `${COOKIE_CONSENT_NAME}=${value}`,
    `Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") attrs.push("Secure");
  document.cookie = attrs.join("; ");
  // Disparar evento para que analytics/marketing scripts puedan
  // suscribirse al cambio sin tener que re-leer la cookie.
  window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: prefs }));
}

/**
 * Mapping de prefs → scopes Consent (DB). Se loggea una fila por
 * cada uno con accepted: true/false para auditoría completa.
 */
export const CONSENT_SCOPES = [
  { key: "necessary", scope: "COOKIES_NECESSARY" as const },
  { key: "functional", scope: "COOKIES_FUNCTIONAL" as const },
  { key: "analytics", scope: "COOKIES_ANALYTICS" as const },
  { key: "marketing", scope: "COOKIES_MARKETING" as const },
] satisfies ReadonlyArray<{
  key: keyof CookiePreferences;
  scope: "COOKIES_NECESSARY" | "COOKIES_FUNCTIONAL" | "COOKIES_ANALYTICS" | "COOKIES_MARKETING";
}>;
