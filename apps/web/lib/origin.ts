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
