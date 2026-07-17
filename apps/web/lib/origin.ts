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
 *   1. VERCEL_URL — hostname del propio deployment que setea Vercel (siempre correcto, confiable).
 *   2. NEXT_PUBLIC_SITE_URL — URL canónica configurada.
 *   3. localhost:PORT — dev.
 */
export function getTrustedSelfBaseUrl(): string {
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return site.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}
