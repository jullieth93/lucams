/*
 * Marca de actividad del CLIENTE para el idle-timeout de sesión (2026-10-12).
 *
 * POLÍTICA: la sesión de cliente persiste 30 días renovándose con actividad
 * (ventana DESLIZANTE — cada request autenticada re-sella la marca con `now`)
 * y expira solo por inactividad prolongada (>30 días sin ninguna request).
 * Al expirar: supabase.auth.signOut({ scope: "global" }) + borrado de cookies
 * sb-* + redirect a `/` (o a /login?next=<ruta> si la ruta requiere sesión,
 * p. ej. /mi-cuenta).
 *
 * Por qué hace falta: Supabase Auth renueva el JWT con refresh token mientras
 * la cookie viva — sin esta marca, una sesión de cliente era efectivamente
 * eterna. El admin ya tenía idle-timeout de 30 min (lib/admin-activity.ts,
 * ADR-062); este es el equivalente cliente con una ventana acorde a retail
 * (30 días, no 30 minutos).
 *
 * Firma y política ante marca dudosa: la marca va FIRMADA con HMAC (primitivo
 * compartido en lib/activity-mark.ts) y la cookie es httpOnly — las cookies
 * sb-* de Supabase NO lo son (el browser client lee la sesión de
 * document.cookie). Desde 2026-10-22 la respuesta se discrimina (antes era
 * fail-closed para todo, espejo del criterio B-8 de admin, y producía logouts
 * espurios en el storefront):
 *   - Marca AUSENTE con sesión VÁLIDA (el JWT ya fue verificado contra el
 *     Auth server por el getUser del proxy) ⇒ se RE-SELLA y se sigue. La
 *     sesión ya está criptográficamente verificada; la marca puede faltar por
 *     sesiones creadas antes de la feature, por evicción del browser bajo
 *     presión de almacenamiento o por cualquier vía de login que no la selle —
 *     cerrar la sesión en esos casos era un logout espurio (bug owner
 *     2026-10-22: «el login se pierde al recargar/navegar»).
 *   - Marca PRESENTE pero con firma INVÁLIDA (forjada, p. ej.
 *     `customer_last_activity=<now>` fabricado con cookies robadas) ⇒ se
 *     revoca (signOut global + borrado sb-* + redirect): ahí sí hay señal de
 *     manipulación (criterio B-8 intacto para este caso y para TODO el
 *     idle-timeout de admin, que permanece fail-closed también ante ausencia).
 *
 * La escriben DOS lugares que DEBEN coincidir (patrón de admin-activity):
 *   - El proxy (middleware): renueva la marca en cada request autenticada de
 *     página (no /api/*, no /admin/* — ese tiene su propio gate de 30 min —,
 *     no /auth/* — esos endpoints gestionan su propio ciclo de sesión) y
 *     cierra la sesión si venció.
 *   - Las acciones que CREAN sesión la SELLAN: login (email/password),
 *     registro cuando Supabase devuelve sesión directa, confirmar-código OTP
 *     y /auth/callback (exchange PKCE). Login de admin sella ambas marcas
 *     (un admin también navega la tienda con su sesión).
 *
 * NO se intenta detectar cambio de red/dispositivo: el refresh token rotation
 * de Supabase Auth ya invalida la cadena completa si un refresh token robado
 * se reusa (detección server-side en GoTrue) — duplicar esa señal acá no
 * agrega seguridad y sí falsos positivos (IPs móviles cambiantes).
 */

import { inspectActivityMark, readActivityMark, sealActivityMark } from "./activity-mark";

export const CUSTOMER_ACTIVITY_COOKIE = "customer_last_activity";

/** 30 días sin actividad de cliente → cierre de sesión (ventana deslizante). */
export const CUSTOMER_IDLE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

// Prefijos que REQUIEREN sesión: al expirar, el redirect va a /login?next=<ruta>
// en vez de a `/`, para que el cliente vuelva a donde estaba tras re-ingresar.
export const CUSTOMER_SESSION_REQUIRED_PREFIXES = ["/mi-cuenta"];

// La cookie DEBE sobrevivir más que la ventana de inactividad (mismo criterio
// que admin): si su maxAge fuese <= 30 días llegaría ya expirada por el browser
// y no se podría distinguir "vencida por inactividad" de "recién autenticada".
const CUSTOMER_ACTIVITY_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 60; // 60 días > 30 días

export function customerActivityCookieOptions() {
  const secure = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: CUSTOMER_ACTIVITY_COOKIE_MAX_AGE_S,
  };
}

/** Sella la marca de actividad del cliente para `now` (epoch ms). */
export function sealCustomerActivityMark(now: number): string {
  return sealActivityMark(now);
}

/**
 * Lee la marca de actividad del cliente de la request: timestamp (epoch ms) o
 * null si falta / es malformada / la firma no coincide.
 */
export function readCustomerActivityMark(raw: string | undefined | null): number | null {
  return readActivityMark(raw);
}

/**
 * Versión discriminada para el proxy (2026-10-22): distingue marca AUSENTE
 * (re-sellar si la sesión es válida) de marca FORJADA (revocar). Política
 * completa en el encabezado del módulo.
 */
export function inspectCustomerActivityMark(raw: string | undefined | null) {
  return inspectActivityMark(raw);
}
