/*
 * Fuente única de la marca de actividad admin para el idle-timeout
 * (ADR-062 P1 + plan de producción). La escriben DOS lugares que DEBEN coincidir:
 *
 *   - El proxy (middleware): renueva la marca en cada request admin (ventana
 *     deslizante) y cierra la sesión si venció.
 *   - La acción de login: SELLA la marca al autenticarse con
 *     `sealAdminActivityMark`. Así una marca AUSENTE en una request admin
 *     autenticada es inequívocamente manipulada/vencida y el gate la trata
 *     como stale → cierra el hueco de "marca ausente = primera visita" que
 *     permitía evadir el idle-timeout borrando la cookie (path=/admin).
 *
 * B-8 (auditoría 2026-08-24): el valor va FIRMADO — `<ts>.<hmac-sha256(ts)>`
 * con CSRF_SECRET, mismo primitivo/patrón que lib/checkout-session.ts — para
 * que un set de cookies robado no pueda fabricar `admin_last_activity=<now>`
 * y evadir el idle-timeout indefinidamente. `node:crypto` es seguro acá: el
 * runtime del proxy en Next.js 16 es `nodejs` (edge ya no se soporta en proxy).
 *
 * El primitivo de firma (seal/read) vive en lib/activity-mark.ts, compartido
 * con la marca de cliente (lib/customer-activity.ts) desde 2026-10-12.
 */

import { readActivityMark, sealActivityMark } from "./activity-mark";

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

/** Emite la marca de actividad firmada para `now` (epoch ms): `<ts>.<hmac-sha256(ts)>`. */
export function sealAdminActivityMark(now: number): string {
  return sealActivityMark(now);
}

/**
 * Verifica la marca de actividad que llega en la request. Devuelve el timestamp
 * de actividad (epoch ms), o null si la marca falta, es malformada o la firma
 * no coincide (forjada) — el caller trata null como stale.
 */
export function readAdminActivityMark(raw: string | undefined | null): number | null {
  return readActivityMark(raw);
}
