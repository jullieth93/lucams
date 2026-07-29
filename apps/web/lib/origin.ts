/*
 * Helper para resolver el origin del request actual (server-side).
 *
 * Caso de uso: pasar `emailRedirectTo` dinámico a Supabase Auth para que
 * los emails generados desde localhost apunten a localhost y los de
 * Vercel apunten a Vercel — sin tener que cambiar la "Site URL" del
 * dashboard cada vez.
 *
 * Lee del header `x-forwarded-host` (Vercel/proxies lo setean) o del
 * `host` raw. El protocol se infiere: si hay `x-forwarded-proto` lo usa,
 * si no, https en prod / http en dev.
 *
 * Las URLs resultantes deben estar en la allowlist "Additional Redirect
 * URLs" de Supabase Auth Dashboard (lo flageamos como acción humana).
 */

import { headers } from "next/headers";

export async function getRequestOrigin(): Promise<string> {
  // Producción: el origin de los emails (confirmación, reset, magic links)
  // sale SOLO de la env canónica, NUNCA del header — x-forwarded-host lo
  // controla el edge de Vercel, pero si algún proxy intermedio deja pasar
  // uno falsificado, los links de Supabase apuntarían a un host atacante
  // (la allowlist de Redirect URLs del dashboard queda como segunda red).
  // Preview/dev siguen derivando del header para que el email apunte al
  // deployment correcto sin tocar la "Site URL" de Supabase.
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_ENV === "production" && site) return site.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protoHeader = h.get("x-forwarded-proto");
  const proto = protoHeader ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

/**
 * Base URL CONFIABLE del PROPIO deployment, derivada solo de env (NO del header `Host`, que es
 * spoofable). Para self-fetch server-side (ej. /api/health/all agregando sub-probes): con un Host
 * falsificado, un baseUrl derivado del request haría que el server fetchee un host arbitrario
 * (SSRF / reporte falso). ADR-062. Prioridad:
 *   1. En producción, NEXT_PUBLIC_SITE_URL — el dominio canónico, público.
 *   2. VERCEL_URL — hostname del propio deployment que setea Vercel (preview/dev en Vercel).
 *   3. NEXT_PUBLIC_SITE_URL — URL canónica configurada.
 *   4. localhost:PORT — dev.
 *
 * Por qué el dominio canónico va PRIMERO en producción (2026-07-20): con **Deployment Protection**
 * activa, la URL de deployment (`VERCEL_URL`) responde `302` hacia el login de Vercel, no el JSON
 * del sub-probe → /api/health/all parseaba HTML y reportaba los 3 servicios `fail` estando sanos.
 * Un monitor externo lo habría leído como caída total. El dominio canónico no está protegido.
 * La propiedad de ADR-062 se mantiene: sigue saliendo SOLO de env, nunca del request.
 */
export function getTrustedSelfBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_ENV === "production" && site) return site.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  if (site) return site.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

// getCanonicalSiteUrl/buildPublicShareUrl viven en lib/public-url.ts (módulo PURO, client-safe);
// se re-exportan acá para no romper los imports server existentes (layout, robots, sitemap).
export { getCanonicalSiteUrl, buildPublicShareUrl } from "./public-url";
