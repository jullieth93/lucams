/*
 * Dominio canónico público del sitio — módulo PURO (sin imports de next/*), seguro de
 * importar desde Server Y Client Components.
 *
 * Separado de lib/origin.ts (que importa next/headers para getRequestOrigin) porque los
 * Client Components también necesitan armar URLs públicas — ej. /mi-cuenta/disenos arma el
 * link /d/<token> para compartir (feedback Lucy 2026-07-23: un link compartido salió con el
 * dominio *.vercel.app del deployment porque se usaba window.location.origin).
 */

/**
 * URL canónica PÚBLICA del sitio (dominio de cara al cliente). #28 — ÚNICA fuente de verdad para
 * sitemap, robots, canonicals y OG: la misma env `NEXT_PUBLIC_SITE_URL` que alimenta metadataBase
 * en app/layout.tsx. Antes sitemap/robots leían `SITE_URL` del CMS mientras canonicals/OG leían la
 * env → split-brain (dos dominios distintos según la superficie).
 *
 * NO usar VERCEL_URL aquí: es el host del deployment/preview, no el dominio canónico. Se strippea
 * el trailing slash porque el sitemap arma `${baseUrl}/${path}`. No llama a next/headers → seguro
 * de importar desde el layout y desde Client Components (Next inlinea NEXT_PUBLIC_* en build).
 */
export function getCanonicalSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lucamsshop.com").replace(/\/+$/, "");
}

/**
 * URL pública ABSOLUTA para compartir (links de diseños /d/<token>, cotizaciones
 * /cotizacion/<token>, pedidos /pedido/<token>). SIEMPRE sobre el dominio canónico:
 * el origen del navegador (window.location.origin) puede ser el alias del deployment
 * (`*.vercel.app`) si Lucy entra por ahí, y el link compartido quedaría en un dominio
 * ajeno a la marca.
 *
 * `path` debe empezar con "/" (se normaliza por si acaso).
 */
export function buildPublicShareUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getCanonicalSiteUrl()}${p}`;
}
