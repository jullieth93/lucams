/*
 * Paquete C (2026-10-09) — clasificación móvil/desktop desde el user-agent
 * persistido en WebVital.userAgent, para el desglose de /admin/performance.
 *
 * Heurística deliberadamente simple (misma idea que los dashboards de RUM):
 * el token "Mobi" cubre los UA móviles de los browsers grandes
 * (Android/iPhone/iPod/Windows Phone); tablets Android (sin "Mobi") y
 * iPadOS-reportando-Mac quedan como desktop — aproximación aceptable para
 * un desglose de rendimiento, no es analytics de audiencia.
 */

export type DeviceClass = "mobile" | "desktop";

export function classifyDevice(userAgent: string | null): DeviceClass {
  if (!userAgent) return "desktop";
  return /mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent) ? "mobile" : "desktop";
}
