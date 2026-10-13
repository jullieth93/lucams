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
 * Firma y fail-closed (mismo criterio B-8 de admin): la marca va FIRMADA con
 * HMAC (primitivo compartido en lib/activity-mark.ts) y la cookie es httpOnly
 * — las cookies sb-* de Supabase NO lo son (el browser client lee la sesión de
 * document.cookie), así que un XSS que robe solo las sb-* llega SIN marca
 * válida y el proxy la trata como expirada. Marca ausente, malformada o con
 * firma inválida en una request autenticada ⇒ stale (borrar la cookie no
 * reinicia el reloj). Efecto colateral del despliegue inicial: las sesiones
 * pre-existentes (sin marca, anteriores a esta feature) expiran en su primera
 * request — un re-login único, deliberado.
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

import { readActivityMark, sealActivityMark } from "./activity-mark";

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
 * null si falta / es malformada / la firma no coincide — el caller (proxy)
 * trata null como sesión expirada (fail-closed, ver encabezado).
 */
export function readCustomerActivityMark(raw: string | undefined | null): number | null {
  return readActivityMark(raw);
}
