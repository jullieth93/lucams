/*
 * Fuente única de la marca de actividad admin para el idle-timeout
 * (ADR-062 P1 + plan de producción). La escriben DOS lugares que DEBEN coincidir:
 *
 *   - El proxy (middleware): renueva la marca en cada request admin (ventana
 *     deslizante) y cierra la sesión si venció.
 *   - La acción de login: SELLA la marca al autenticarse. Así una marca AUSENTE en
 *     una request admin autenticada es inequívocamente manipulada/vencida y el gate
 *     la trata como stale → cierra el hueco de "marca ausente = primera visita" que
 *     permitía evadir el idle-timeout borrando la cookie (path=/admin).
 *
 * Edge-safe: solo lee env, sin APIs de Node (el proxy corre en Edge runtime).
 */

export const ADMIN_ACTIVITY_COOKIE = "admin_last_activity";

/** 30 min sin actividad admin → cierre de sesión. */
export const ADMIN_IDLE_LIMIT_MS = 30 * 60 * 1000;

// La cookie DEBE sobrevivir mucho más que la ventana de inactividad: si su maxAge
// fuese <= el límite, tras ese tiempo llegaría ya EXPIRADA (last=0) y —con la marca
// sellada en login— seguiría detectándose como stale, pero mantenerla viva permite
// distinguir "vencida por inactividad" de "recién autenticada".
const ADMIN_ACTIVITY_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 días >> 30 min

export function adminActivityCookieOptions() {
  const secure = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/admin",
    maxAge: ADMIN_ACTIVITY_COOKIE_MAX_AGE_S,
  };
}
